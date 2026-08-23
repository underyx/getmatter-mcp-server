/**
 * MCP endpoint: stateless streamable HTTP.
 *
 * Matter credentials arrive either as the OAuth access token this server
 * issued (claude.ai connector flow) or as a pair of custom headers (manual
 * configuration). They are only ever forwarded to Matter's API.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMatterServer } from "../src/server.js";
import type { MatterTokens } from "../src/matter-api.js";
import { decodeTokens, publicOrigin } from "../src/http.js";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, X-Matter-Access-Token, X-Matter-Refresh-Token, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function getTokensFromRequest(request: Request): MatterTokens | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const tokens = decodeTokens(authHeader.slice(7).trim());
    if (tokens) return tokens;
  }

  const accessToken = request.headers.get("x-matter-access-token");
  const refreshToken = request.headers.get("x-matter-refresh-token");
  if (accessToken && refreshToken) {
    return { accessToken, refreshToken };
  }

  return null;
}

/** 401 with the metadata pointer that makes MCP clients start the OAuth login flow (RFC 9728). */
function unauthorized(request: Request): Response {
  const resourceMetadata = `${publicOrigin(request)}/.well-known/oauth-protected-resource`;
  return new Response(
    JSON.stringify({
      error: "invalid_token",
      error_description: "Please connect your Matter account using the Connect button",
    }),
    {
      status: 401,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadata}", error="invalid_token"`,
      },
    },
  );
}

async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Stateless server: there is no SSE event stream to resume and no session to
  // delete, so anything but POST gets a 405 (clients treat that as "no SSE offered").
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { ...CORS_HEADERS, Allow: "POST, OPTIONS" } });
  }

  const tokens = getTokensFromRequest(request);
  if (!tokens) return unauthorized(request);

  // Stateless mode: a fresh server + transport per request.
  const server = createMatterServer(tokens);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  const response = await transport.handleRequest(request);
  return withCors(response);
}

export { handler as GET, handler as POST, handler as DELETE, handler as OPTIONS };
