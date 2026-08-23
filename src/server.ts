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
import { z, ZodError } from "zod";
import { MatterClient, libraryStateToString, type FeedEntry, type MatterTokens } from "./matter-api.js";

/** Full article bodies run to 70 KB+; past this the response gets cut off by MCP hosts anyway. */
const MAX_CONTENT_CHARS = 40_000;

// Tool definitions
export const TOOLS = [
  {
    name: "matter_list_articles",
    description:
      "List articles from your Matter library, most recently changed first, with their IDs, titles, URLs, authors, status (QUEUE or ARCHIVE) and reading progress. Deleted articles are never listed. Page with offset; the footer says whether more follow.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "integer",
          description: "Maximum number of articles to return (default: 20, max: 100)",
          default: 20,
          minimum: 1,
          maximum: 100,
        },
        offset: {
          type: "integer",
          description: "Number of articles to skip, for paging (default: 0)",
          default: 0,
          minimum: 0,
        },
        status: {
          type: "string",
          enum: ["queue", "archive"],
          description: "Only articles in the reading queue, or only archived ones. Omit for both.",
        },
      },
    },
  },
  {
    name: "matter_get_article",
    description:
      "Get detailed information about a specific article (by the ID shown in matter_list_articles): metadata, excerpt, your highlights and notes, and the full text. Long articles are cut at 40,000 characters; set include_content to false for just the metadata and highlights.",
    inputSchema: {
      type: "object" as const,
      properties: {
        article_id: {
          type: "string",
          description: "The ID of the article to retrieve, as shown by matter_list_articles",
        },
        include_content: {
          type: "boolean",
          description: "Include the full article text (default: true)",
          default: true,
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

// Input validation schemas. Some clients send every argument as a string, so
// numbers and booleans are coerced from their obvious spellings.
const looseBoolean = z.preprocess(
  (value) => (value === "true" ? true : value === "false" ? false : value),
  z.boolean(),
);

const ListArticlesInputSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  status: z.enum(["queue", "archive"]).optional(),
});

const GetArticleInputSchema = z.object({
  article_id: z.string().trim().min(1),
  include_content: looseBoolean.optional().default(true),
});

/** "limit: Number must be less than or equal to 100" rather than a dumped issue array. */
function describeZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length ? issue.path.join(".") : "input"}: ${issue.message}`)
    .join("; ");
}

const SaveArticleInputSchema = z.object({
  url: z.string().url(),
});

export function formatArticle(entry: FeedEntry, options: { includeContent?: boolean } = {}): string {
  const { content, annotations } = entry;
  const includeContent = options.includeContent ?? true;
  const lines: string[] = [];

  lines.push(`# ${content.title}`);
  lines.push("");

  // Author - check author.any_name or author.name
  const authorName = content.author?.any_name || content.author?.name;
  if (authorName) {
    lines.push(`**Author:** ${authorName}`);
  }

  // Publisher - check publisher.any_name or publisher.name
  const publisherName = content.publisher?.any_name || content.publisher?.name;
  if (publisherName) {
    lines.push(`**Publisher:** ${publisherName}`);
  }

  if (content.publication_date) {
    lines.push(`**Published:** ${content.publication_date}`);
  }

  lines.push(`**URL:** ${content.url}`);

  // Library state is in content.library.library_state
  if (content.library) {
    lines.push(`**Status:** ${libraryStateToString(content.library.library_state)}`);
  }

  // Word count and reading time from article
  if (content.article?.word_count) {
    lines.push(`**Word Count:** ${content.article.word_count}`);
  }

  if (content.article?.reading_time_minutes) {
    lines.push(`**Reading Time:** ${content.article.reading_time_minutes} min`);
  }

  // Reading progress from history; an article never opened has no history, which is 0%.
  const readProgress = content.history?.max_read_percentage ?? content.history?.last_read_percentage ?? 0;
  lines.push(`**Reading Progress:** ${Math.round(readProgress * 100)}%`);

  // Tags
  if (content.tags && content.tags.length > 0) {
    lines.push(`**Tags:** ${content.tags.map((t) => t.name).join(", ")}`);
  }

  // Excerpt
  if (content.excerpt) {
    lines.push("");
    lines.push("## Excerpt");
    lines.push(content.excerpt);
  }

  // My note
  if (content.my_note) {
    lines.push("");
    lines.push("## My Notes");
    lines.push(content.my_note);
  }

  // Highlights/annotations - check both entry.annotations and content.my_annotations
  const allAnnotations = [...(annotations || []), ...(content.my_annotations || [])];
  if (allAnnotations.length > 0) {
    lines.push("");
    lines.push("## Highlights");
    for (const annotation of allAnnotations) {
      lines.push("");
      lines.push(`> ${annotation.text}`);
      if (annotation.note) {
        lines.push(`  *Note: ${annotation.note}*`);
      }
    }
  }

  // Full article content if available
  if (includeContent && content.article?.markdown) {
    lines.push("");
    lines.push("## Full Article");
    const markdown = content.article.markdown;
    if (markdown.length > MAX_CONTENT_CHARS) {
      lines.push(markdown.slice(0, MAX_CONTENT_CHARS));
      lines.push("");
      lines.push(
        `*[Article text cut here: ${markdown.length - MAX_CONTENT_CHARS} more characters. Read the rest at ${content.url}]*`,
      );
    } else {
      lines.push(markdown);
    }
  }

  return lines.join("\n");
}

export function formatArticleList(
  entries: FeedEntry[],
  paging: { offset: number; hasMore: boolean } = { offset: 0, hasMore: false },
): string {
  const lines: string[] = [];
  const range =
    entries.length === 0
      ? "No articles"
      : `Articles ${paging.offset + 1}-${paging.offset + entries.length}${paging.hasMore ? "" : " (end of list)"}`;
  lines.push(`${range}:\n`);

  for (const entry of entries) {
    const { content } = entry;

    // Get reading progress from history
    const readProgress = content.history?.max_read_percentage ?? content.history?.last_read_percentage ?? 0;
    const progress = Math.round(readProgress * 100);

    // Get author name
    const authorName = content.author?.any_name || content.author?.name;
    const author = authorName ? ` by ${authorName}` : "";

    // Get library state
    const status = content.library ? libraryStateToString(content.library.library_state) : "UNKNOWN";

    lines.push(`- **${content.title}**${author}`);
    lines.push(`  ID: ${content.id}`);
    lines.push(`  URL: ${content.url}`);
    lines.push(`  Status: ${status} | Progress: ${progress}%`);
    lines.push("");
  }

  if (paging.hasMore) {
    lines.push(`More articles follow; call again with offset ${paging.offset + entries.length}.`);
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
          const { articles, hasMore } = await client.getArticles({
            limit: input.limit,
            offset: input.offset,
            status: input.status,
          });
          return {
            content: [
              {
                type: "text",
                text: formatArticleList(articles, { offset: input.offset, hasMore }),
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
                text: formatArticle(article, { includeContent: input.include_content }),
              },
            ],
          };
        }

        case "matter_save_article": {
          const input = SaveArticleInputSchema.parse(args);
          const result = await client.saveArticle(input.url);
          const lines = [`Article saved to your Matter queue.`, `URL: ${input.url}`];
          if (result.title) lines.push(`Title: ${result.title}`);
          const contentId = result.content_id ?? (result.content as { id?: unknown } | undefined)?.id ?? result.id;
          if (contentId !== undefined) lines.push(`Content ID: ${contentId}`);
          return {
            content: [{ type: "text", text: lines.join("\n") }],
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
      const errorMessage =
        error instanceof ZodError
          ? `Invalid arguments — ${describeZodError(error)}`
          : error instanceof Error
            ? error.message
            : String(error);
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
