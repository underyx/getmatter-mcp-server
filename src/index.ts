#!/usr/bin/env node

/**
 * Matter MCP Server - Stdio Entry Point
 *
 * An MCP server for interacting with Matter, the read-later app.
 * This entry point is for local use with Claude Desktop via stdio.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMatterServer } from "./server.js";
import type { MatterTokens } from "./matter-api.js";

// Environment variable names for configuration
const ENV_ACCESS_TOKEN = "MATTER_ACCESS_TOKEN";
const ENV_REFRESH_TOKEN = "MATTER_REFRESH_TOKEN";

async function main() {
  // Get tokens from environment variables
  const accessToken = process.env[ENV_ACCESS_TOKEN];
  const refreshToken = process.env[ENV_REFRESH_TOKEN];

  if (!accessToken || !refreshToken) {
    console.error(`Error: Missing required environment variables.

Please set the following environment variables:
  - ${ENV_ACCESS_TOKEN}: Your Matter access token
  - ${ENV_REFRESH_TOKEN}: Your Matter refresh token

To obtain these tokens:
1. Install the Matter Obsidian plugin
2. Connect it to your Matter account via QR code scan
3. Find the tokens in .obsidian/plugins/matter/data.json
   - accessToken -> ${ENV_ACCESS_TOKEN}
   - refreshToken -> ${ENV_REFRESH_TOKEN}
`);
    process.exit(1);
  }

  const tokens: MatterTokens = { accessToken, refreshToken };
  const server = createMatterServer(tokens);

  // Start the server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Matter MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
