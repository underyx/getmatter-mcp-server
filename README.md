# Matter MCP Server

An MCP (Model Context Protocol) server for [Matter](https://getmatter.com), the read-later app. This server allows AI assistants to interact with your Matter reading list - listing articles, getting article details with highlights, and saving new articles.

## Features

- **List Articles**: Browse your Matter reading list with titles, authors, progress, and status
- **Get Article Details**: Retrieve full article information including highlights and annotations
- **Save Articles**: Add new URLs to your Matter queue

## Usage with claude.ai (remote)

The remote server runs on Cloudflare Workers at `https://getmatter-mcp-server.underyx.workers.dev/mcp` and signs you in with the same QR code the Matter app uses for its other integrations — click **Connect** and scan.

1. Go to [claude.ai](https://claude.ai) Settings → Connectors → **Add custom connector**
2. URL: `https://getmatter-mcp-server.underyx.workers.dev/mcp`
3. Click **Connect**
4. Scan the QR code with the Matter app on your phone
5. Done! Your Matter account is now connected

The server is its own small OAuth 2.1 authorization server (dynamic client registration, metadata discovery), which is what claude.ai's connector flow requires. It is stateless: the Matter tokens obtained by the QR scan are handed back to claude.ai inside the OAuth access token and are never stored on the server — they are only ever forwarded to Matter's API.

Claude Code connects the same way:

```bash
claude mcp add --transport http matter https://getmatter-mcp-server.underyx.workers.dev/mcp
```

Clients that can send static headers can skip OAuth and pass the tokens directly as `X-Matter-Access-Token` and `X-Matter-Refresh-Token` (see below for how to obtain them).

## Deploy your own

```bash
npm install
npx wrangler login
npx wrangler deploy
```

There are no secrets, databases or KV namespaces to provision. The included GitHub Actions workflow (`.github/workflows/deploy.yml`) deploys on every push to `main` and smoke-tests the result; it needs two repository secrets:

| Secret | Where it comes from |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | An API token using the *Edit Cloudflare Workers* template |
| `CLOUDFLARE_ACCOUNT_ID` | `npx wrangler whoami`, or the Cloudflare dashboard URL |

## Usage with Claude Desktop (Local)

For local use, run `npm install && npm run build` and obtain tokens manually via the Obsidian plugin.

### Getting Your Matter API Tokens

1. Install [Obsidian](https://obsidian.md/)
2. Install the [Matter plugin](https://github.com/getmatterapp/obsidian-matter) from Community Plugins
3. Open Matter plugin settings in Obsidian - you'll see a QR code
4. On your phone, open **Matter app → Profile → Settings → Connected Accounts → Obsidian**
5. Scan the QR code
6. Find your tokens in `.obsidian/plugins/matter/data.json`

### Configuration

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "matter": {
      "command": "node",
      "args": ["/path/to/getmatter-mcp-server/dist/index.js"],
      "env": {
        "MATTER_ACCESS_TOKEN": "your-access-token",
        "MATTER_REFRESH_TOKEN": "your-refresh-token"
      }
    }
  }
}
```

## Available Tools

### matter_list_articles

List articles from your Matter reading list.

**Parameters:**
- `limit` (optional): Maximum number of articles to return (default: 20, max: 100)

**Example:**
```
List my Matter articles
```

### matter_get_article

Get detailed information about a specific article.

**Parameters:**
- `article_id` (required): The ID of the article to retrieve

**Example:**
```
Get details for article with ID abc123
```

### matter_save_article

Save a new article to your Matter queue.

**Parameters:**
- `url` (required): The URL of the article to save

**Example:**
```
Save https://example.com/interesting-article to Matter
```

## Development

```bash
npm install
npm run typecheck
npx wrangler dev    # serve the remote server locally at http://localhost:8787/mcp
npm run build       # compile the stdio entry point to dist/
```

The server is plain TypeScript on the official MCP SDK: `src/server.ts` defines the tools, `src/matter-api.ts` is the Matter API client, `src/index.ts` is the stdio entry point, and `api/mcp.ts` plus `api/oauth/*` serve the remote endpoints. Those handlers are all plain `Request` -> `Response` functions; `worker/index.ts` is only the routing table that maps paths onto them.

## API Notes

This server uses Matter's internal API (v11), which was reverse-engineered from the [official Obsidian plugin](https://github.com/getmatterapp/obsidian-matter). The API is not officially documented and may change. Key endpoints:

- `GET /library_items/highlights_feed/` - List articles with highlights
- `POST /library_items/queue_entries/` - Save new articles
- `POST /token/refresh/` - Refresh access token

## License

MIT
