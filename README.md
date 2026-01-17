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

## Getting Your Matter API Tokens

Matter doesn't have a public API, but you can obtain tokens through the Obsidian plugin:

1. Install [Obsidian](https://obsidian.md/) if you haven't already
2. Install the [Matter plugin](https://github.com/getmatterapp/obsidian-matter) from Community Plugins
3. Open Matter plugin settings in Obsidian
4. Open the Matter app on your phone
5. Go to **Profile → Settings → Connected Accounts → Obsidian**
6. Scan the QR code shown in Obsidian
7. Find your tokens in `.obsidian/plugins/matter/data.json`:
   ```json
   {
     "accessToken": "your-access-token",
     "refreshToken": "your-refresh-token"
   }
   ```

## Configuration

Set these environment variables:

```bash
export MATTER_ACCESS_TOKEN="your-access-token"
export MATTER_REFRESH_TOKEN="your-refresh-token"
```

## Usage with claude.ai (Vercel Deployment)

Deploy to Vercel for use with claude.ai as a remote MCP server. Your Matter tokens are passed securely from claude.ai - nothing is stored on the server.

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
   - **Headers**:
     - `X-Matter-Access-Token`: Your Matter access token
     - `X-Matter-Refresh-Token`: Your Matter refresh token

Your tokens are sent with each request and never stored on the server.

## Usage with Claude Desktop (Local)

For local use with Claude Desktop, add to your configuration (`claude_desktop_config.json`):

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
