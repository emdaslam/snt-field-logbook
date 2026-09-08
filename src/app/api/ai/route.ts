// Proxy for AI export polish calls.
// The upstream router (router.bynara.id) does not return
// Access-Control-Allow-Origin headers, so the Capacitor WebView on Android
// blocks every direct fetch. This Next.js API route acts as an origin-side
// proxy — the app calls /api/ai and the server forwards it to the upstream.
export const dynamic = "force-static";

const ENVOY_BASE = "https://router.bynara.id/v1/chat/completions";

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const body = await request.text();
  try {
    const res = await fetch(ENVOY_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.text();
    return new Response(data, {
      status: res.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: { message: "AI proxy timeout" } }),
      { status: 504, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }
}
