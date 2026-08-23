/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591)
 *
 * claude.ai registers itself as a client before starting the login flow. The
 * server is stateless and never checks the client id again, so any request is
 * accepted and the id is a throwaway UUID.
 */

import { corsPreflight, jsonResponse, methodNotAllowed } from "../../src/http.js";

async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return corsPreflight();
  if (request.method !== "POST") return methodNotAllowed("POST, OPTIONS");

  let body: Record<string, unknown> = {};
  try {
    const parsed = (await request.json()) as unknown;
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    // An empty or malformed body still registers a client.
  }

  return jsonResponse(
    {
      client_id: crypto.randomUUID(),
      client_name: body.client_name ?? "MCP Client",
      redirect_uris: body.redirect_uris ?? [],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201,
  );
}

export { handler as POST, handler as OPTIONS };
