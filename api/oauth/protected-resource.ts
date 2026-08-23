import { corsPreflight, jsonResponse, publicOrigin } from "../../src/http.js";

// RFC 9728 — OAuth 2.0 Protected Resource Metadata.
function handler(request: Request): Response {
  if (request.method === "OPTIONS") return corsPreflight();
  const origin = publicOrigin(request);
  return jsonResponse({
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["read", "write"],
  });
}

export { handler as GET, handler as OPTIONS };
