/**
 * Matter MCP Server - Vercel API Route
 *
 * This API route handles MCP communication over HTTP/SSE for use with claude.ai.
 * Tokens are passed from the client via headers, not stored on the server.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createMatterServer } from "../dist/server.js";
import type { MatterTokens } from "../dist/matter-api.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

// Store active transports and their associated tokens by session ID
const sessions = new Map<string, { transport: SSEServerTransport; tokens: MatterTokens }>();

function getTokensFromHeaders(req: VercelRequest): MatterTokens | null {
  // Tokens passed via custom headers
  const accessToken = req.headers["x-matter-access-token"] as string | undefined;
  const refreshToken = req.headers["x-matter-refresh-token"] as string | undefined;

  if (accessToken && refreshToken) {
    return { accessToken, refreshToken };
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight first
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Matter-Access-Token, X-Matter-Refresh-Token");
    return res.status(204).end();
  }

  if (req.method === "GET") {
    // SSE connection - client wants to establish a session
    const tokens = getTokensFromHeaders(req);

    if (!tokens) {
      return res.status(401).json({
        error: "Missing Matter API tokens. Provide X-Matter-Access-Token and X-Matter-Refresh-Token headers.",
      });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const transport = new SSEServerTransport("/api/mcp", res);
    const sessionId = transport.sessionId;
    sessions.set(sessionId, { transport, tokens });

    const server = createMatterServer(tokens);

    // Clean up on close
    res.on("close", () => {
      sessions.delete(sessionId);
    });

    await server.connect(transport);
    return;
  }

  if (req.method === "POST") {
    // Message from client
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found. Please reconnect." });
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    await session.transport.handlePostMessage(req, res);
    return;
  }

  return res.status(405).json({ error: "Method not allowed" });
}
