/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591)
 *
 * Claude.ai may use this to dynamically register as an OAuth client.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Accept any client registration request
  const body = req.body || {};

  // Generate a client ID (we don't actually need to track clients since we're stateless)
  const clientId = randomUUID();

  // Return the registered client info
  return res.status(201).json({
    client_id: clientId,
    client_name: body.client_name || "MCP Client",
    redirect_uris: body.redirect_uris || [],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  });
}
