import { corsPreflight, jsonResponse, publicOrigin } from "../../src/http.js";

// RFC 8414 — OAuth 2.0 Authorization Server Metadata.
function handler(request: Request): Response {
  if (request.method === "OPTIONS") return corsPreflight();
  const origin = publicOrigin(request);
  return jsonResponse({
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256", "plain"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    scopes_supported: ["read", "write"],
  });
}

export { handler as GET, handler as OPTIONS };
