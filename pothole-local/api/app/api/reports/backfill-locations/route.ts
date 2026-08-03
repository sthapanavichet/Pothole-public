import { corsJson, corsPreflight, publicError } from "@/lib/http";
import { requireWriteAuth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getSupabaseAdmin } from "@/lib/supabase";
import { assignTemporaryLocation } from "@/lib/regions";
import { isLocalStorageMode } from "@/lib/localStore";

export const runtime = "nodejs";

/**
 * One-time / idempotent maintenance endpoint.
 *
 * Assigns a persistent temporary coordinate + region to any existing pothole
 * report that has real detections but no location yet. Records with zero
 * detections are skipped (they are not potholes and should not become markers).
 */
export function OPTIONS(request: Request) {
  return corsPreflight(request);
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, {
    keyPrefix: "backfill",
    limit: 5,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const auth = requireWriteAuth(request);
  if (!auth.ok) return auth.response;

  try {
    if (isLocalStorageMode()) {
      return corsJson(
        {
          updated: 0,
          skipped: 0,
          total: 0,
          message: "Backfill is not needed in local storage mode.",
        },
        undefined,
        request
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("pothole_reports")
      .select("*")
      .is("latitude", null);

    if (error) {
      return publicError(error, request);
    }

    const rows = data ?? [];
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const detections = Array.isArray(metadata.detections)
        ? (metadata.detections as unknown[])
        : [];
      const detectionCount =
        typeof metadata.detection_count === "number"
          ? metadata.detection_count
          : detections.length;

      if (detectionCount <= 0) {
        skipped++;
        continue;
      }

      const assigned = assignTemporaryLocation();
      const nextMetadata = {
        ...metadata,
        region_id: assigned.region_id,
        region_name: assigned.region_name,
        temp_location: true,
      };

      const { error: updateError } = await supabase
        .from("pothole_reports")
        .update({
          latitude: assigned.latitude,
          longitude: assigned.longitude,
          metadata: nextMetadata,
        })
        .eq("id", row.id);

      if (updateError) {
        return publicError(updateError, request);
      }

      updated++;
    }

    return corsJson({ updated, skipped, total: rows.length }, undefined, request);
  } catch (error) {
    return publicError(error, request);
  }
}
