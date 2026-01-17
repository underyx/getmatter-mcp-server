# Matter MCP Server

An MCP (Model Context Protocol) server for [Matter](https://getmatter.com), the read-later app. This server allows AI assistants to interact with your Matter reading list - listing articles, getting article details with highlights, and saving new articles.

## Features

- **List Articles**: Browse your Matter reading list with titles, authors, progress, and status
- **Get Article Details**: Retrieve full article information including highlights and annotations
- **Save Articles**: Add new URLs to your Matter queue

## Installation

```bash
npm install
npm run build
```

## Usage with claude.ai (Vercel Deployment)

Deploy to Vercel for use with claude.ai as a remote MCP server. Uses OAuth-style QR code authentication - just click Connect and scan!

### 1. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/underyx/getmatter-mcp-server)

Or deploy manually:

```bash
npm install -g vercel
vercel
```

No environment variables needed - the server is stateless.

### 2. Add to claude.ai

1. Go to [claude.ai](https://claude.ai) Settings
2. Navigate to **MCP Servers** (or Integrations)
3. Add a new remote MCP server:
   - **URL**: `https://your-project.vercel.app/api/mcp`
   - **Authorization URL**: `https://your-project.vercel.app/api/oauth/authorize`
   - **Token URL**: `https://your-project.vercel.app/api/oauth/token`
4. Click **Connect**
5. Scan the QR code with the Matter app on your phone
6. Done! Your Matter account is now connected

Your tokens are obtained via QR code scan and stored securely by claude.ai.

## Usage with Claude Desktop (Local)

For local use, you'll need to obtain tokens manually via the Obsidian plugin.

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
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run the server
npm start
```

## API Notes

This server uses Matter's internal API (v11), which was reverse-engineered from the [official Obsidian plugin](https://github.com/getmatterapp/obsidian-matter). The API is not officially documented and may change. Key endpoints:

- `GET /library_items/highlights_feed/` - List articles with highlights
- `POST /library_items/queue_entries/` - Save new articles
- `POST /token/refresh/` - Refresh access token

## License

MIT
