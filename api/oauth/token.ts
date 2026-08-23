/**
 * OAuth Token Endpoint
 *
 * Exchanges the authorization code for an access token. The code is the pair
 * of Matter tokens as base64 JSON (built by the /authorize page), and the
 * access token is the same pair re-encoded, so nothing is stored server-side.
 */

import { corsPreflight, decodeTokens, encodeTokens, jsonResponse, methodNotAllowed, readParams } from "../../src/http.js";

async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return corsPreflight();
  if (request.method !== "POST") return methodNotAllowed("POST, OPTIONS");

  const params = await readParams(request);
  const code = params.code;
  if (!code) {
    return jsonResponse(
      { error: "invalid_request", error_description: "Missing code parameter" },
      400,
    );
  }

  const tokens = decodeTokens(code);
  if (!tokens) {
    return jsonResponse(
      { error: "invalid_grant", error_description: "Invalid or expired authorization code" },
      400,
    );
  }

  return jsonResponse({
    access_token: encodeTokens(tokens),
    token_type: "Bearer",
    // Included for completeness; the MCP endpoint refreshes through Matter itself.
    refresh_token: tokens.refreshToken,
  });
}

export { handler as POST, handler as OPTIONS };
