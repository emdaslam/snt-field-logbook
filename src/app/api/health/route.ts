// Offline app: no database, no external services. This endpoint exists purely
// so the hosting/preview environment has something to health-check.
export const dynamic = "force-static";

export async function GET() {
  return Response.json({ ok: true, mode: "offline" });
}
