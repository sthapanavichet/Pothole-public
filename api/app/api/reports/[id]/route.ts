import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase";
import { deleteImageByUrl } from "@/lib/storage";
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

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("pothole_reports")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return jsonError(error.message, error.code === "PGRST116" ? 404 : 500);
    }

    return NextResponse.json({ report: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return jsonError(message, 500);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as UpdateReportInput;

    if (body.severity && !VALID_SEVERITIES.has(body.severity)) {
      return jsonError("Invalid severity value.");
    }

    if (body.status && !VALID_STATUSES.has(body.status)) {
      return jsonError("Invalid status value.");
    }

    const updates = Object.fromEntries(
      Object.entries(body).filter(([, value]) => value !== undefined)
    );

    if (Object.keys(updates).length === 0) {
      return jsonError("No fields provided to update.");
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("pothole_reports")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return jsonError(error.message, error.code === "PGRST116" ? 404 : 500);
    }

    return NextResponse.json({ report: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return jsonError(message, 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();

    const { data: existing, error: fetchError } = await supabase
      .from("pothole_reports")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError) {
      return jsonError(fetchError.message, fetchError.code === "PGRST116" ? 404 : 500);
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
      return jsonError(deleteError.message, 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return jsonError(message, 500);
  }
}
