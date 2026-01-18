/**
 * QR Login Exchange Proxy
 *
 * Proxies the QR login exchange request to Matter API to avoid CORS issues.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const MATTER_API = "https://api.getmatter.app/api/v11";

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

  const { session_token } = req.body || {};

  if (!session_token) {
    return res.status(400).json({ error: "Missing session_token" });
  }

  try {
    const response = await fetch(`${MATTER_API}/qr_login/exchange/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_token }),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to exchange token",
      details: String(error),
    });
  }
}
