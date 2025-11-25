#!/usr/bin/env node

/**
 * Matter MCP Server
 *
 * An MCP server for interacting with Matter, the read-later app.
 * Provides tools to list, read, and save articles.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { MatterClient, type FeedEntry, type MatterTokens } from "./matter-api.js";

// Environment variable names for configuration
const ENV_ACCESS_TOKEN = "MATTER_ACCESS_TOKEN";
const ENV_REFRESH_TOKEN = "MATTER_REFRESH_TOKEN";

// Tool definitions
const TOOLS = [
  {
    name: "matter_list_articles",
    description:
      "List articles from your Matter reading list. Returns a paginated list of saved articles with their titles, URLs, authors, and reading progress.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of articles to return (default: 20, max: 100)",
          default: 20,
        },
      },
    },
  },
  {
    name: "matter_get_article",
    description:
      "Get detailed information about a specific article including its full content, highlights, annotations, and notes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        article_id: {
          type: "string",
          description: "The ID of the article to retrieve",
        },
      },
      required: ["article_id"],
    },
  },
  {
    name: "matter_save_article",
    description:
      "Save a new article to your Matter reading queue. Provide a URL and the article will be added to your queue for later reading.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The URL of the article to save",
        },
      },
      required: ["url"],
    },
  },
];

// Input validation schemas
const ListArticlesInputSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(20),
});

const GetArticleInputSchema = z.object({
  article_id: z.string().min(1),
});

const SaveArticleInputSchema = z.object({
  url: z.string().url(),
});

function formatArticle(entry: FeedEntry): string {
  const { content, annotations } = entry;
  const lines: string[] = [];

  lines.push(`# ${content.title}`);
  lines.push("");

  if (content.author?.any_name) {
    lines.push(`**Author:** ${content.author.any_name}`);
  }

  if (content.publisher?.name) {
    lines.push(`**Publisher:** ${content.publisher.name}`);
  }

  if (content.publication_date) {
    lines.push(`**Published:** ${content.publication_date}`);
  }

  lines.push(`**URL:** ${content.url}`);
  lines.push(`**Status:** ${content.library_state}`);

  if (content.word_count) {
    lines.push(`**Word Count:** ${content.word_count}`);
  }

  lines.push(`**Reading Progress:** ${Math.round(content.reading_progress * 100)}%`);

  if (content.my_tags && content.my_tags.length > 0) {
    lines.push(`**Tags:** ${content.my_tags.map((t) => t.name).join(", ")}`);
  }

  if (content.my_note) {
    lines.push("");
    lines.push("## My Notes");
    lines.push(content.my_note);
  }

  if (annotations && annotations.length > 0) {
    lines.push("");
    lines.push("## Highlights");
    for (const annotation of annotations) {
      lines.push("");
      lines.push(`> ${annotation.text}`);
      if (annotation.note) {
        lines.push(`  *Note: ${annotation.note}*`);
      }
    }
  }

  return lines.join("\n");
}

function formatArticleList(entries: FeedEntry[]): string {
  const lines: string[] = [];
  lines.push(`Found ${entries.length} articles:\n`);

  for (const entry of entries) {
    const { content } = entry;
    const progress = Math.round(content.reading_progress * 100);
    const author = content.author?.any_name ? ` by ${content.author.any_name}` : "";

    lines.push(`- **${content.title}**${author}`);
    lines.push(`  ID: ${content.id}`);
    lines.push(`  URL: ${content.url}`);
    lines.push(`  Status: ${content.library_state} | Progress: ${progress}%`);
    lines.push("");
  }

  return lines.join("\n");
}

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
  const client = new MatterClient(tokens, (newTokens) => {
    // Log token refresh for debugging (tokens are refreshed automatically)
    console.error("Matter tokens refreshed");
  });

  // Create MCP server
  const server = new Server(
    {
      name: "matter-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "matter_list_articles": {
          const input = ListArticlesInputSchema.parse(args);
          const { articles } = await client.getArticles({ limit: input.limit });
          return {
            content: [
              {
                type: "text",
                text: formatArticleList(articles),
              },
            ],
          };
        }

        case "matter_get_article": {
          const input = GetArticleInputSchema.parse(args);
          const article = await client.getArticle(input.article_id);

          if (!article) {
            return {
              content: [
                {
                  type: "text",
                  text: `Article with ID "${input.article_id}" not found.`,
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text",
                text: formatArticle(article),
              },
            ],
          };
        }

        case "matter_save_article": {
          const input = SaveArticleInputSchema.parse(args);
          const result = await client.saveArticle(input.url);
          return {
            content: [
              {
                type: "text",
                text: `Article saved successfully!\nURL: ${input.url}\nID: ${result.id || "assigned"}`,
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: "text",
                text: `Unknown tool: ${name}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Matter MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
