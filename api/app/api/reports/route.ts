import { NextResponse } from "next/server";
import { jsonError, parseMetadata, parseOptionalNumber } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase";
import { uploadImage } from "@/lib/storage";
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

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("pothole_reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return jsonError(error.message, 500);
    }

    return NextResponse.json({ reports: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return jsonError(message, 500);
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      return await createReportFromFormData(request);
    }

    if (contentType.includes("application/json")) {
      return await createReportFromJson(request);
    }

    return jsonError("Use multipart/form-data or application/json.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return jsonError(message, 500);
  }
}

async function createReportFromFormData(request: Request) {
  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof File)) {
    return jsonError("Image file is required.");
  }

  const annotatedImage = formData.get("annotated_image");
  const metadata = parseMetadata(formData.get("metadata"));
  const latitude = parseOptionalNumber(formData.get("latitude"));
  const longitude = parseOptionalNumber(formData.get("longitude"));
  const severity = parseSeverity(formData.get("severity"));
  const status = parseStatus(formData.get("status"));
  const notes = readOptionalString(formData.get("notes"));

  const imageUrl = await uploadImage(image, "original");
  let annotatedImageUrl: string | null = null;

  if (annotatedImage instanceof File && annotatedImage.size > 0) {
    annotatedImageUrl = await uploadImage(annotatedImage, "annotated");
  }

  return insertReport({
    image_url: imageUrl,
    annotated_image_url: annotatedImageUrl,
    metadata,
    latitude,
    longitude,
    severity,
    status: status ?? "pending",
    notes,
  });
}

async function createReportFromJson(request: Request) {
  const body = (await request.json()) as CreateReportInput;

  if (!body.image_url) {
    return jsonError("image_url is required.");
  }

  if (body.severity && !VALID_SEVERITIES.has(body.severity)) {
    return jsonError("Invalid severity value.");
  }

  if (body.status && !VALID_STATUSES.has(body.status)) {
    return jsonError("Invalid status value.");
  }

  return insertReport({
    image_url: body.image_url,
    annotated_image_url: body.annotated_image_url ?? null,
    metadata: body.metadata ?? {},
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    severity: body.severity ?? null,
    status: body.status ?? "pending",
    notes: body.notes ?? null,
  });
}

async function insertReport(report: CreateReportInput) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("pothole_reports")
    .insert(report)
    .select("*")
    .single();

  if (error) {
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ report: data }, { status: 201 });
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
