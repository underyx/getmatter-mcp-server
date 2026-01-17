/**
 * Matter MCP Server - Shared Server Logic
 *
 * This module contains the core MCP server setup that can be used
 * with different transports (stdio for local, HTTP/SSE for remote).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { MatterClient, type FeedEntry, type MatterTokens } from "./matter-api.js";

// Tool definitions
export const TOOLS = [
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

export function formatArticle(entry: FeedEntry): string {
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

export function formatArticleList(entries: FeedEntry[]): string {
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

export function createMatterServer(tokens: MatterTokens): Server {
  const client = new MatterClient(tokens);

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

  return server;
}
