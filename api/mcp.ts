/**
 * Matter MCP Server - Vercel API Route
 *
 * This API route handles MCP communication over HTTP/SSE for use with claude.ai.
 * It uses the Streamable HTTP transport for bidirectional communication.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createMatterServer } from "../dist/server.js";
import type { MatterTokens } from "../dist/matter-api.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

// Store active transports by session ID
const transports = new Map<string, SSEServerTransport>();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Get tokens from environment variables
  const accessToken = process.env.MATTER_ACCESS_TOKEN;
  const refreshToken = process.env.MATTER_REFRESH_TOKEN;

  if (!accessToken || !refreshToken) {
    return res.status(500).json({
      error: "Server misconfigured: Missing Matter API tokens",
    });
  }

  const tokens: MatterTokens = { accessToken, refreshToken };

  if (req.method === "GET") {
    // SSE connection - client wants to receive messages
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const transport = new SSEServerTransport("/api/mcp", res);
    const sessionId = transport.sessionId;
    transports.set(sessionId, transport);

    const server = createMatterServer(tokens);

    // Clean up on close
    res.on("close", () => {
      transports.delete(sessionId);
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

    const transport = transports.get(sessionId);
    if (!transport) {
      return res.status(404).json({ error: "Session not found" });
    }

    await transport.handlePostMessage(req, res);
    return;
  }

  if (req.method === "OPTIONS") {
    // CORS preflight
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  return res.status(405).json({ error: "Method not allowed" });
}
