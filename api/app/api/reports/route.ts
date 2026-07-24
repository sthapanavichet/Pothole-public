import {
  corsJson,
  corsPreflight,
  jsonError,
  parseMetadata,
  parseOptionalNumber,
  publicError,
  sanitizeNotes,
} from "@/lib/http";
import { requireReadAuth, requireWriteAuth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getSupabaseAdmin } from "@/lib/supabase";
import { uploadImage } from "@/lib/storage";
import { assignTemporaryLocation, findRegionForPoint } from "@/lib/regions";
import type { CreateReportInput, ReportSeverity, ReportStatus } from "@/lib/types";

export const runtime = "nodejs";

const VALID_SEVERITIES = new Set<ReportSeverity>([
  "critical",
  "high",
  "medium",
  "low",
]);

const VALID_STATUSES = new Set<ReportStatus>([
  "pending",
  "in_progress",
  "repaired",
]);

export function OPTIONS(request: Request) {
  return corsPreflight(request);
}

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    keyPrefix: "reports-get",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const auth = requireReadAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const region = readOptionalString(searchParams.get("region"));

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("pothole_reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return publicError(error, request);
    }

    let reports = data ?? [];

    if (region) {
      const needle = region.toLowerCase();
      reports = reports.filter((r) => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        const regionId = String(meta.region_id ?? "").toLowerCase();
        const regionName = String(meta.region_name ?? "").toLowerCase();
        return regionId === needle || regionName === needle;
      });
    }

    return corsJson({ reports }, undefined, request);
  } catch (error) {
    return publicError(error, request);
  }
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, {
    keyPrefix: "reports-post",
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const auth = requireWriteAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      return await createReportFromFormData(request);
    }

    if (contentType.includes("application/json")) {
      return await createReportFromJson(request);
    }

    return jsonError("Use multipart/form-data or application/json.", 400, request);
  } catch (error) {
    return publicError(error, request);
  }
}

async function createReportFromFormData(request: Request) {
  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof File)) {
    return jsonError("Image file is required.", 400, request);
  }

  const annotatedImage = formData.get("annotated_image");
  const metadata = parseMetadata(formData.get("metadata"));
  const latitude = parseOptionalNumber(formData.get("latitude"));
  const longitude = parseOptionalNumber(formData.get("longitude"));
  const severity = parseSeverity(formData.get("severity"));
  const status = parseStatus(formData.get("status"));
  const notes = sanitizeNotes(readOptionalString(formData.get("notes")));

  const imageUrl = await uploadImage(image, "original");
  let annotatedImageUrl: string | null = null;

  if (annotatedImage instanceof File && annotatedImage.size > 0) {
    annotatedImageUrl = await uploadImage(annotatedImage, "annotated");
  }

  return insertReport(
    {
      image_url: imageUrl,
      annotated_image_url: annotatedImageUrl,
      metadata,
      latitude,
      longitude,
      severity,
      status: status ?? "pending",
      notes,
    },
    request
  );
}

async function createReportFromJson(request: Request) {
  const body = (await request.json()) as CreateReportInput;

  if (!body.image_url) {
    return jsonError("image_url is required.", 400, request);
  }

  if (body.severity && !VALID_SEVERITIES.has(body.severity)) {
    return jsonError("Invalid severity value.", 400, request);
  }

  if (body.status && !VALID_STATUSES.has(body.status)) {
    return jsonError("Invalid status value.", 400, request);
  }

  return insertReport(
    {
      image_url: body.image_url,
      annotated_image_url: body.annotated_image_url ?? null,
      metadata: body.metadata ?? {},
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      severity: body.severity ?? null,
      status: body.status ?? "pending",
      notes: sanitizeNotes(body.notes ?? null),
    },
    request
  );
}

async function insertReport(report: CreateReportInput, request: Request) {
  const metadata = { ...(report.metadata ?? {}) } as Record<string, unknown>;
  const detections = Array.isArray(metadata.detections)
    ? (metadata.detections as unknown[])
    : [];
  const detectionCount =
    typeof metadata.detection_count === "number"
      ? metadata.detection_count
      : detections.length;

  if (detectionCount <= 0) {
    return jsonError(
      "No pothole detections found. A report is only created when a pothole is detected.",
      400,
      request
    );
  }

  metadata.detection_count = detectionCount;

  const withLocation = applyLocation({ ...report, metadata });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("pothole_reports")
    .insert(withLocation)
    .select("*")
    .single();

  if (error) {
    return publicError(error, request);
  }

  return corsJson({ report: data }, { status: 201 }, request);
}

function applyLocation(report: CreateReportInput): CreateReportInput {
  const metadata = { ...(report.metadata ?? {}) } as Record<string, unknown>;

  let latitude = report.latitude ?? null;
  let longitude = report.longitude ?? null;

  if (latitude === null || longitude === null) {
    const assigned = assignTemporaryLocation();
    latitude = assigned.latitude;
    longitude = assigned.longitude;
    metadata.region_id = assigned.region_id;
    metadata.region_name = assigned.region_name;
    metadata.temp_location = true;
  } else {
    const region = findRegionForPoint(latitude, longitude);
    if (region) {
      metadata.region_id = region.region_id;
      metadata.region_name = region.region_name;
    }
    metadata.temp_location = false;
  }

  return { ...report, latitude, longitude, metadata };
}

function parseSeverity(value: FormDataEntryValue | null): ReportSeverity | null {
  const text = readOptionalString(value);
  if (!text) {
    return null;
  }
  if (!VALID_SEVERITIES.has(text as ReportSeverity)) {
    throw new Error("Invalid severity value.");
  }
  return text as ReportSeverity;
}

function parseStatus(value: FormDataEntryValue | null): ReportStatus | null {
  const text = readOptionalString(value);
  if (!text) {
    return null;
  }
  if (!VALID_STATUSES.has(text as ReportStatus)) {
    throw new Error("Invalid status value.");
  }
  return text as ReportStatus;
}

function readOptionalString(value: FormDataEntryValue | null): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
