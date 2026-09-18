// Babuki's backend lives at api.babuki.com — a separate service from this
// frontend (see apps/api), so mobile clients can share it later. Never
// call /api/* on this app's own origin; there is no server logic here.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
