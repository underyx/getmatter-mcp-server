const BODY = {
  name: "getmatter-mcp-server",
  description: "MCP server for Matter, the read-later app",
  mcp_endpoint: "/mcp",
  transport: "streamable-http",
  authentication:
    "Connect through the OAuth flow (scan the QR code with the Matter app), or send X-Matter-Access-Token and X-Matter-Refresh-Token headers on requests to /mcp.",
  source: "https://github.com/underyx/getmatter-mcp-server",
};

export function GET(): Response {
  return new Response(JSON.stringify(BODY, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
