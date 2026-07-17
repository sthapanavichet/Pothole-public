import { NextResponse } from "next/server";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function parseMetadata(value: FormDataEntryValue | null): Record<string, unknown> {
  if (!value || typeof value !== "string" || value.trim() === "") {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Metadata must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("Invalid metadata JSON.");
  }
}

export function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  if (!value || typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new Error("Latitude and longitude must be numbers.");
  }
  return num;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
