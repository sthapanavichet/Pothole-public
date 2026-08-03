import { corsJson, corsPreflight, jsonError, publicError } from "@/lib/http";
import { requireReadAuth, requireWriteAuth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getSupabaseAdmin } from "@/lib/supabase";
import { deleteImageByUrl } from "@/lib/storage";
import {
  deleteLocalReport,
  getLocalReport,
  isLocalStorageMode,
  updateLocalReport,
} from "@/lib/localStore";
import type { PotholeReport, ReportSeverity, ReportStatus, UpdateReportInput } from "@/lib/types";

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

type RouteContext = {
  params: Promise<{ id: string }>;
};

export function OPTIONS(request: Request) {
  return corsPreflight(request);
}

export async function GET(request: Request, context: RouteContext) {
  const limited = enforceRateLimit(request, {
    keyPrefix: "report-get",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const auth = requireReadAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;

    if (isLocalStorageMode()) {
      const report = getLocalReport(id);
      if (!report) {
        return jsonError("Report not found.", 404, request);
      }
      return corsJson({ report }, undefined, request);
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("pothole_reports")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return jsonError("Report not found.", 404, request);
      }
      return publicError(error, request);
    }

    return corsJson({ report: data }, undefined, request);
  } catch (error) {
    return publicError(error, request);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const limited = enforceRateLimit(request, {
    keyPrefix: "report-patch",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const auth = requireWriteAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as UpdateReportInput;

    if (body.severity && !VALID_SEVERITIES.has(body.severity)) {
      return jsonError("Invalid severity value.", 400, request);
    }

    if (body.status && !VALID_STATUSES.has(body.status)) {
      return jsonError("Invalid status value.", 400, request);
    }

    const updates = Object.fromEntries(
      Object.entries(body).filter(([, value]) => value !== undefined)
    );

    if (Object.keys(updates).length === 0) {
      return jsonError("No fields provided to update.", 400, request);
    }

    if (isLocalStorageMode()) {
      const report = updateLocalReport(id, updates);
      if (!report) {
        return jsonError("Report not found.", 404, request);
      }
      return corsJson({ report }, undefined, request);
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("pothole_reports")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return jsonError("Report not found.", 404, request);
      }
      return publicError(error, request);
    }

    return corsJson({ report: data }, undefined, request);
  } catch (error) {
    return publicError(error, request);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const limited = enforceRateLimit(request, {
    keyPrefix: "report-delete",
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const auth = requireWriteAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;

    if (isLocalStorageMode()) {
      const deleted = deleteLocalReport(id);
      if (!deleted) {
        return jsonError("Report not found.", 404, request);
      }
      return corsJson({ success: true }, undefined, request);
    }

    const supabase = getSupabaseAdmin();

    const { data: existing, error: fetchError } = await supabase
      .from("pothole_reports")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return jsonError("Report not found.", 404, request);
      }
      return publicError(fetchError, request);
    }

    const report = existing as PotholeReport;
    await deleteImageByUrl(report.image_url);
    if (report.annotated_image_url) {
      await deleteImageByUrl(report.annotated_image_url);
    }

    const { error: deleteError } = await supabase
      .from("pothole_reports")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return publicError(deleteError, request);
    }

    return corsJson({ success: true }, undefined, request);
  } catch (error) {
    return publicError(error, request);
  }
}
