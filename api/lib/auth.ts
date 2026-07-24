import { timingSafeEqual } from "crypto";
import { jsonError } from "@/lib/http";

export type AuthResult =
  | { ok: true; role: "read" | "write" }
  | { ok: false; response: Response };

function readHeaderKey(request: Request): string | null {
  const raw =
    request.headers.get("x-api-key") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    null;
  const key = raw?.trim();
  return key ? key : null;
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

function getWriteKey(): string | null {
  return process.env.API_WRITE_KEY?.trim() || null;
}

function getReadKey(): string | null {
  return process.env.API_READ_KEY?.trim() || null;
}

/**
 * Require the write API key for create/update/delete/maintenance.
 * Fails closed if API_WRITE_KEY is not configured in production-like envs.
 */
export function requireWriteAuth(request: Request): AuthResult {
  const expected = getWriteKey();
  if (!expected) {
    return {
      ok: false,
      response: jsonError(
        "Server write authentication is not configured (API_WRITE_KEY).",
        503,
        request
      ),
    };
  }

  const provided = readHeaderKey(request);
  if (!provided || !safeEqual(provided, expected)) {
    return {
      ok: false,
      response: jsonError(
        "Unauthorized. Valid write API key required.",
        401,
        request
      ),
    };
  }

  return { ok: true, role: "write" };
}

/**
 * Require read API key when API_READ_KEY is set.
 * If unset, reads remain open (rate-limited + CORS still apply).
 */
export function requireReadAuth(request: Request): AuthResult {
  const expected = getReadKey();
  if (!expected) {
    return { ok: true, role: "read" };
  }

  const provided = readHeaderKey(request);
  if (!provided || !safeEqual(provided, expected)) {
    return {
      ok: false,
      response: jsonError(
        "Unauthorized. Valid read API key required.",
        401,
        request
      ),
    };
  }

  return { ok: true, role: "read" };
}
