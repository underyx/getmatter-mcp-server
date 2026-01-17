/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728)
 *
 * Tells MCP clients where to find the authorization server.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Get the base URL from the request
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const baseUrl = `${protocol}://${host}`;

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  return res.status(200).json({
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [`${baseUrl}`],
    bearer_methods_supported: ["header"],
    scopes_supported: ["read", "write"],
  });
}
