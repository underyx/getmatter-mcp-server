/**
 * Matter MCP Server - Vercel API Route
 *
 * This API route handles MCP communication over Streamable HTTP for use with claude.ai.
 * Tokens are passed from the client via headers, not stored on the server.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createMatterServer } from "../dist/server.js";
import type { MatterTokens } from "../dist/matter-api.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

function getTokensFromRequest(req: VercelRequest): MatterTokens | null {
  // Try custom headers first
  const accessToken = req.headers["x-matter-access-token"] as string | undefined;
  const refreshToken = req.headers["x-matter-refresh-token"] as string | undefined;

  if (accessToken && refreshToken) {
    return { accessToken, refreshToken };
  }

  // Try Basic Auth (for OAuth Client ID/Secret from claude.ai)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Basic ")) {
    try {
      const base64 = authHeader.slice(6);
      const decoded = Buffer.from(base64, "base64").toString("utf-8");
      const [clientId, clientSecret] = decoded.split(":");
      if (clientId && clientSecret) {
        return { accessToken: clientId, refreshToken: clientSecret };
      }
    } catch {
      // Invalid base64, fall through
    }
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Matter-Access-Token, X-Matter-Refresh-Token, Mcp-Session-Id");
    return res.status(204).end();
  }

  // Set CORS headers for all responses
  res.setHeader("Access-Control-Allow-Origin", "*");

  const tokens = getTokensFromRequest(req);

  if (!tokens) {
    return res.status(401).json({
      error: "Missing Matter API tokens",
      hint: "Provide X-Matter-Access-Token and X-Matter-Refresh-Token headers, or use Basic Auth with access token as username and refresh token as password",
    });
  }

  // Create server and transport for this request
  const server = createMatterServer(tokens);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode
  });

  // Connect server to transport
  await server.connect(transport);

  // Handle the request
  await transport.handleRequest(req, res, req.body);
}
