/**
 * OAuth Token Endpoint
 *
 * Exchanges the authorization code for access tokens.
 * The code contains the Matter tokens encoded as base64 JSON.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Parse request body (could be JSON or form-urlencoded)
  let code: string | undefined;
  let grantType: string | undefined;

  if (typeof req.body === "string") {
    const params = new URLSearchParams(req.body);
    code = params.get("code") || undefined;
    grantType = params.get("grant_type") || undefined;
  } else if (req.body) {
    code = req.body.code;
    grantType = req.body.grant_type;
  }

  if (!code) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "Missing code parameter",
    });
  }

  try {
    // Decode the authorization code (base64 JSON with tokens)
    const decoded = JSON.parse(Buffer.from(code, "base64").toString("utf-8"));
    const { access_token, refresh_token } = decoded;

    if (!access_token || !refresh_token) {
      throw new Error("Invalid token structure");
    }

    // Return tokens in OAuth format
    // We encode both tokens into the access_token so the MCP endpoint can use them
    const combinedToken = Buffer.from(
      JSON.stringify({ accessToken: access_token, refreshToken: refresh_token })
    ).toString("base64");

    return res.status(200).json({
      access_token: combinedToken,
      token_type: "Bearer",
      // Include refresh_token for completeness
      refresh_token: refresh_token,
    });
  } catch (error) {
    return res.status(400).json({
      error: "invalid_grant",
      error_description: "Invalid or expired authorization code",
    });
  }
}
