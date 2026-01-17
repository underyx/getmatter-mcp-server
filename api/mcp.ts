/**
 * Matter MCP Server - Vercel API Route
 *
 * This API route handles MCP communication over Streamable HTTP for use with claude.ai.
 * Tokens are passed via Bearer token from OAuth flow.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createMatterServer } from "../dist/server.js";
import type { MatterTokens } from "../dist/matter-api.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

function getTokensFromRequest(req: VercelRequest): MatterTokens | null {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    // Try to decode as our combined token format (base64 JSON)
    try {
      const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
      if (decoded.accessToken && decoded.refreshToken) {
        return {
          accessToken: decoded.accessToken,
          refreshToken: decoded.refreshToken,
        };
      }
    } catch {
      // Not our format, fall through
    }
  }

  // Fallback: Try custom headers (for manual configuration)
  const accessToken = req.headers["x-matter-access-token"] as string | undefined;
  const refreshToken = req.headers["x-matter-refresh-token"] as string | undefined;

  if (accessToken && refreshToken) {
    return { accessToken, refreshToken };
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Matter-Access-Token, X-Matter-Refresh-Token, Mcp-Session-Id"
    );
    return res.status(204).end();
  }

  // Set CORS headers for all responses
  res.setHeader("Access-Control-Allow-Origin", "*");

  const tokens = getTokensFromRequest(req);

  if (!tokens) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Please connect your Matter account using the Connect button",
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
