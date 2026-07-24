import { corsHeaders } from "@/lib/http";

type Bucket = {
  timestamps: number[];
};

const buckets = new Map<string, Bucket>();

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Simple in-memory sliding-window rate limiter.
 * Good enough for a single Vercel region / local server.
 * Returns null when allowed, or a Response when limited.
 */
export function enforceRateLimit(
  request: Request,
  {
    keyPrefix,
    limit,
    windowMs,
  }: { keyPrefix: string; limit: number; windowMs: number }
): Response | null {
  const ip = clientIp(request);
  const key = `${keyPrefix}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= limit) {
    const retryAfter = Math.ceil(
      (windowMs - (now - bucket.timestamps[0])) / 1000
    );
    return new Response(JSON.stringify({ error: "Too many requests. Slow down." }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.max(retryAfter, 1)),
        ...corsHeaders(request),
      },
    });
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return null;
}
