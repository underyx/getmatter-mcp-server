/**
 * OAuth Authorization Endpoint
 *
 * Displays a QR code for the user to scan with the Matter app.
 * After scanning, redirects back to claude.ai with the tokens.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const MATTER_API = "https://api.getmatter.app/api/v11";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const redirectUri = req.query.redirect_uri as string;
  const state = req.query.state as string;

  if (!redirectUri) {
    return res.status(400).json({ error: "Missing redirect_uri" });
  }

  // Trigger QR login to get session token
  let triggerData: Record<string, unknown>;
  try {
    const triggerResponse = await fetch(`${MATTER_API}/qr_login/trigger/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!triggerResponse.ok) {
      const errorText = await triggerResponse.text();
      return res.status(500).json({
        error: "Failed to initiate Matter login",
        status: triggerResponse.status,
        details: errorText
      });
    }

    triggerData = await triggerResponse.json();
  } catch (error) {
    return res.status(500).json({
      error: "Failed to connect to Matter API",
      details: String(error)
    });
  }

  // Handle both camelCase and snake_case field names
  const sessionToken = triggerData.session_token || triggerData.sessionToken;
  const qrCodeUrl = triggerData.qr_code_url || triggerData.qrCodeUrl || triggerData.qr_url || triggerData.qrUrl;

  if (!sessionToken || !qrCodeUrl) {
    return res.status(500).json({
      error: "Unexpected response from Matter API",
      response: triggerData
    });
  }

  // Return HTML page with QR code that polls for completion
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect to Matter</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: rgba(255,255,255,0.1);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      max-width: 400px;
    }
    h1 { margin-bottom: 0.5rem; }
    p { opacity: 0.9; margin-bottom: 1.5rem; }
    .qr-container {
      background: white;
      padding: 1rem;
      border-radius: 12px;
      display: inline-block;
      margin-bottom: 1.5rem;
    }
    .qr-container img {
      display: block;
      width: 200px;
      height: 200px;
    }
    .status {
      padding: 0.75rem 1.5rem;
      background: rgba(255,255,255,0.2);
      border-radius: 8px;
      font-size: 0.9rem;
    }
    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-right: 8px;
      vertical-align: middle;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error { background: rgba(255,0,0,0.3); }
    .success { background: rgba(0,255,0,0.3); }
  </style>
</head>
<body>
  <div class="container">
    <h1>Connect to Matter</h1>
    <p>Scan this QR code with the Matter app on your phone</p>
    <div class="qr-container">
      <img src="${qrCodeUrl}" alt="QR Code" />
    </div>
    <div class="status" id="status">
      <span class="spinner"></span>
      Waiting for you to scan...
    </div>
  </div>

  <script>
    const sessionToken = ${JSON.stringify(sessionToken)};
    const redirectUri = ${JSON.stringify(redirectUri)};
    const state = ${JSON.stringify(state || "")};

    async function pollForTokens() {
      const statusEl = document.getElementById('status');

      for (let i = 0; i < 120; i++) { // Poll for up to 2 minutes
        try {
          const response = await fetch('/api/oauth/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_token: sessionToken })
          });

          if (response.ok) {
            const data = await response.json();
            const accessToken = data.access_token || data.accessToken;
            const refreshToken = data.refresh_token || data.refreshToken;

            if (accessToken && refreshToken) {
              statusEl.innerHTML = '✓ Connected! Redirecting...';
              statusEl.className = 'status success';

              // Encode tokens as the authorization code
              const code = btoa(JSON.stringify({
                access_token: accessToken,
                refresh_token: refreshToken
              }));

              // Redirect back to claude.ai
              const url = new URL(redirectUri);
              url.searchParams.set('code', code);
              if (state) url.searchParams.set('state', state);

              window.location.href = url.toString();
              return;
            }
          }
        } catch (e) {
          console.error('Poll error:', e);
        }

        await new Promise(r => setTimeout(r, 1000));
      }

      statusEl.innerHTML = '✗ Timed out. Please refresh and try again.';
      statusEl.className = 'status error';
    }

    pollForTokens();
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  return res.status(200).send(html);
}
