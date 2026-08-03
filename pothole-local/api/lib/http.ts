import { NextResponse } from "next/server";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function configuredOrigins(): string[] {
  const fromEnv = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...fromEnv])];
}

export function resolveCorsOrigin(request?: Request): string | null {
  const allowed = configuredOrigins();
  const origin = request?.headers.get("origin");

  // Non-browser clients (curl, Streamlit) often send no Origin.
  if (!origin) {
    return allowed[0] || "*";
  }

  if (allowed.includes(origin) || allowed.includes("*")) {
    return origin;
  }

  return null;
}

export function corsHeaders(request?: Request): Record<string, string> {
  const origin = resolveCorsOrigin(request);
  if (!origin) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  };
}

export function corsJson(body: unknown, init?: ResponseInit, request?: Request) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...corsHeaders(request), ...(init?.headers ?? {}) },
  });
}

export function corsPreflight(request?: Request) {
  const headers = corsHeaders(request);
  if (!request?.headers.get("origin")) {
    return new NextResponse(null, { status: 204, headers });
  }
  if (!headers["Access-Control-Allow-Origin"]) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers });
}

export function jsonError(message: string, status = 400, request?: Request) {
  return NextResponse.json(
    { error: message },
    { status, headers: corsHeaders(request) }
  );
}

export function publicError(error: unknown, request?: Request) {
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd && error instanceof Error) {
    return jsonError(error.message, 500, request);
  }
  return jsonError("Something went wrong. Please try again.", 500, request);
}

export function parseMetadata(value: FormDataEntryValue | null): Record<string, unknown> {
  if (!value || typeof value !== "string" || value.trim() === "") {
    return {};
  }

  if (value.length > 100_000) {
    throw new Error("Metadata JSON is too large.");
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
  if (!Number.isFinite(num)) {
    throw new Error("Latitude and longitude must be finite numbers.");
  }
  return num;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export function sanitizeNotes(notes: string | null): string | null {
  if (!notes) return null;
  const trimmed = notes.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 2000);
}
