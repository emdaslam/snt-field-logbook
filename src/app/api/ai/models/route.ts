// Proxy for the upstream /v1/models listing endpoint.
// Lets the Settings screen fetch the available model IDs from the router so
// users can pick from a dropdown instead of typing a free-form string.
export const dynamic = "force-static";

const ENVOY_BASE = "https://router.bynara.id/v1";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  try {
    const res = await fetch(`${ENVOY_BASE}/models`, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.text();
    return new Response(data, {
      status: res.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: { message: "Models endpoint timeout" } }), {
      status: 504,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}
