import { corsJson, corsPreflight } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rateLimit";

export function OPTIONS(request: Request) {
  return corsPreflight(request);
}

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, {
    keyPrefix: "health",
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  return corsJson(
    {
      ok: true,
      service: "pothole-api",
    },
    undefined,
    request
  );
}
