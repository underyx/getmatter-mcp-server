/**
 * QR Login Exchange Proxy
 *
 * The /authorize page polls this with the QR session token until the user has
 * scanned the code. It proxies Matter's exchange endpoint so the browser never
 * has to talk to Matter cross-origin. While the login is pending Matter answers
 * 200 with null tokens, which the page treats as "keep waiting".
 */

import { MatterAPIError, MatterClient } from "../../src/matter-api.js";
import { corsPreflight, jsonResponse, methodNotAllowed } from "../../src/http.js";

async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return corsPreflight();
  if (request.method !== "POST") return methodNotAllowed("POST, OPTIONS");

  let sessionToken: unknown;
  try {
    sessionToken = ((await request.json()) as { session_token?: unknown }).session_token;
  } catch {
    // handled below
  }
  if (typeof sessionToken !== "string" || !sessionToken) {
    return jsonResponse({ error: "Missing session_token" }, 400);
  }

  try {
    return jsonResponse(await MatterClient.exchangeQRToken(sessionToken));
  } catch (error) {
    if (error instanceof MatterAPIError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: "Failed to exchange token", details: String(error) }, 500);
  }
}

export { handler as POST, handler as OPTIONS };
