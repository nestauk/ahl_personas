export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function apiHeaders(): Record<string, string> {
  const key = process.env.NEXT_PUBLIC_API_KEY;
  if (!key) return {};
  return { "X-API-Key": key };
}
