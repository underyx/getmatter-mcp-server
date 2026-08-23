/**
 * Small helpers shared by the HTTP handlers in api/.
 *
 * Everything here is Web-standard (Request/Response/Headers) so the same
 * handlers run unchanged under Cloudflare Workers, `wrangler dev`, and Node.
 */

import type { MatterTokens } from "./matter-api.js";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function methodNotAllowed(allow: string): Response {
  return jsonResponse({ error: "Method not allowed" }, 405, { Allow: allow });
}

/** Public origin of the deployment, used to build absolute URLs in OAuth metadata. */
export function publicOrigin(request: Request): string {
  return new URL(request.url).origin;
}

/**
 * Parse a request body that may be JSON or form-urlencoded (OAuth token
 * requests are usually the latter). Returns a flat string map; unparseable
 * or empty bodies yield an empty object.
 */
export async function readParams(request: Request): Promise<Record<string, string>> {
  const text = await request.text();
  if (!text) return {};
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
        );
      }
    } catch {
      // fall through to form parsing
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

/**
 * The OAuth access token this server hands out is just the pair of Matter
 * tokens as base64 JSON, so the server stays stateless. The authorization
 * code uses the same encoding (built with `btoa` in the browser), only with
 * snake_case keys; both spellings are accepted when decoding.
 */
export function encodeTokens(tokens: MatterTokens): string {
  return Buffer.from(
    JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }),
  ).toString("base64");
}

export function decodeTokens(encoded: string): MatterTokens | null {
  try {
    const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8")) as Record<string, unknown>;
    const accessToken = decoded.accessToken ?? decoded.access_token;
    const refreshToken = decoded.refreshToken ?? decoded.refresh_token;
    if (typeof accessToken === "string" && typeof refreshToken === "string" && accessToken && refreshToken) {
      return { accessToken, refreshToken };
    }
  } catch {
    // not our format
  }
  return null;
}
