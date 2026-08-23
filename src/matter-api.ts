/**
 * Matter API Client
 *
 * Based on reverse-engineered API from the Matter web app
 * @see https://web.getmatter.com/
 */

const API_BASE = "https://api.getmatter.com/api/v20";

export interface MatterTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Library state values, as defined by the Matter web app's own constants
 * (LIBRARY_STATE_UNSAVED/SAVED/ARCHIVED/DELETED). UNSAVED is an item that
 * arrived through a feed or newsletter and was never saved to the queue.
 */
export enum LibraryState {
  UNSAVED = 0,
  QUEUE = 1,
  ARCHIVE = 2,
  DELETED = 3,
}

export function libraryStateToString(state: number): string {
  switch (state) {
    case LibraryState.UNSAVED:
      return "UNSAVED";
    case LibraryState.QUEUE:
      return "QUEUE";
    case LibraryState.ARCHIVE:
      return "ARCHIVE";
    case LibraryState.DELETED:
      return "DELETED";
    default:
      return `UNKNOWN (${state})`;
  }
}

export type ArticleStatusFilter = "queue" | "archive";

/** Deleted entries stay in the feed forever; nobody listing their articles wants them. */
export function isListable(entry: FeedEntry, status?: ArticleStatusFilter): boolean {
  const state = entry.content.library?.library_state;
  if (state === LibraryState.DELETED) return false;
  if (status === "queue") return state === LibraryState.QUEUE;
  if (status === "archive") return state === LibraryState.ARCHIVE;
  return true;
}

export interface Profile {
  id: number;
  profile_type: number;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  is_managed: boolean;
  avatar_photo: string | null;
  display_name: string | null;
  any_name: string;
  domain: string | null;
  domain_photo: string | null;
  url: string | null;
  photo_url: string | null;
}

export interface Tag {
  name: string;
}

export interface Annotation {
  id: string;
  text: string;
  note: string | null;
  created_date: string;
  word_start: number;
  word_end: number;
}

export interface Library {
  id: number;
  content_id: number;
  library_state: number;
  library_state_date: string;
  modified_date: string;
  is_favorited: boolean;
  last_favorited_date: string | null;
  rating: number | null;
  queue_order: number;
}

export interface RssFeed {
  id: number;
  name: string;
  photo_url: string | null;
  url: string;
}

export interface Article {
  id: number;
  url: string;
  title: string;
  authors: string[];
  publisher: Profile | null;
  publication_date: string | null;
  word_count: number | null;
  reading_time_minutes: number | null;
  markdown: string | null;
  language: string | null;
}

export interface History {
  id: number;
  content_id: number;
  last_viewed_date: string | null;
  last_interaction_date: string | null;
  last_annotated_date: string | null;
  last_read_percentage: number | null;
  max_read_percentage: number | null;
}

export interface Content {
  id: number;
  url: string;
  title: string;
  author: Profile | null;
  publisher: Profile | null;
  newsletter_profile: Profile | null;
  rss_feed_profile: Profile | null;
  publication_date: string | null;
  feed_date: string | null;
  sub_title: string | null;
  excerpt: string | null;
  blurb: string | null;
  photo_thumbnail_url: string | null;
  source_type: number;
  history: History | null;
  library: Library | null;
  my_annotations: Annotation[];
  my_note: string | null;
  tags: Tag[];
  rss_feed: RssFeed | null;
  share_url: string | null;
  article: Article | null;
  content_type: number;
}

export interface FeedEntry {
  id: string;
  content: Content;
  recommendations: unknown[];
  annotations: Annotation[];
}

export interface FeedResponse {
  id: string;
  feed: FeedEntry[];
  next: string | null;
  previous: string | null;
  queue_count?: number;
  archive_count?: number;
}

export interface QRLoginResponse {
  session_token?: string;
  qr_code_url?: string;
}

export interface QRExchangeResponse {
  access_token?: string | null;
  refresh_token?: string | null;
}

export interface TokenRefreshResponse {
  access_token: string;
  refresh_token: string;
}

/** Loosely typed: the save endpoint's shape is not documented and has changed before. */
export interface SaveArticleResponse {
  id?: number | string;
  content_id?: number | string;
  url?: string;
  title?: string;
  [key: string]: unknown;
}

export class MatterAPIError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: unknown
  ) {
    super(message);
    this.name = "MatterAPIError";
  }

  /** "HTTP 403 Forbidden: <what the API said>" — the body is where Matter explains itself. */
  static async fromResponse(response: Response, context?: string): Promise<MatterAPIError> {
    const text = await response.text().catch(() => "");
    let detail = text;
    try {
      const body = JSON.parse(text) as Record<string, unknown>;
      const picked = body.detail ?? body.error ?? body.message ?? body.non_field_errors;
      if (picked !== undefined) detail = typeof picked === "string" ? picked : JSON.stringify(picked);
    } catch {
      // not JSON; keep the raw text
    }
    const where = context ? ` ${context}` : "";
    const summary = detail ? `: ${detail.slice(0, 300)}` : "";
    return new MatterAPIError(
      `Matter API request failed${where} (HTTP ${response.status} ${response.statusText})${summary}`,
      response.status,
      text
    );
  }
}

export class MatterClient {
  private accessToken: string;
  private refreshToken: string;
  private onTokenRefresh?: (tokens: MatterTokens) => void;

  constructor(tokens: MatterTokens, onTokenRefresh?: (tokens: MatterTokens) => void) {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.onTokenRefresh = onTokenRefresh;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.accessToken}`,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Try to refresh the token
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        // Retry the request with the new token
        headers["Authorization"] = `Bearer ${this.accessToken}`;
        const retryResponse = await fetch(url, {
          ...options,
          headers,
        });

        if (!retryResponse.ok) {
          throw await MatterAPIError.fromResponse(retryResponse, "after token refresh");
        }
        return retryResponse.json() as Promise<T>;
      }
      throw new MatterAPIError("Authentication failed", 401);
    }

    if (!response.ok) {
      throw await MatterAPIError.fromResponse(response);
    }

    return response.json() as Promise<T>;
  }

  private async refreshAccessToken(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/token/refresh/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json() as TokenRefreshResponse;
      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;

      if (this.onTokenRefresh) {
        this.onTokenRefresh({
          accessToken: this.accessToken,
          refreshToken: this.refreshToken,
        });
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * List the user's articles from the updates feed, most recently changed
   * first. Deleted entries are skipped, and `status` narrows to the queue or
   * the archive. `offset` skips that many matching articles, so the caller can
   * page without a cursor; `hasMore` says whether anything followed the page.
   */
  async getArticles(options?: {
    limit?: number;
    offset?: number;
    status?: ArticleStatusFilter;
    afterTimestamp?: string;
  }): Promise<{ articles: FeedEntry[]; hasMore: boolean; queueCount?: number; archiveCount?: number }> {
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;
    const wanted = offset + limit;
    const matching: FeedEntry[] = [];
    let page = 1;

    // Use a very old timestamp to get all articles, or use provided timestamp
    const afterTimestamp = options?.afterTimestamp || "1970-01-01T00:00:00.000000+00:00";

    let hasMore = true;
    let queueCount: number | undefined;
    let archiveCount: number | undefined;

    // One extra article beyond the page tells us whether there is a next page.
    while (hasMore && matching.length <= wanted) {
      const url = `/library_items/updates_feed/?after_timestamp=${encodeURIComponent(afterTimestamp)}&page=${page}`;
      const response: FeedResponse = await this.request<FeedResponse>(url);

      matching.push(...response.feed.filter((entry) => isListable(entry, options?.status)));

      // Store counts from first response
      if (page === 1) {
        queueCount = response.queue_count;
        archiveCount = response.archive_count;
      }

      hasMore = response.next !== null;
      page++;
    }

    return {
      articles: matching.slice(offset, wanted),
      hasMore: matching.length > wanted,
      queueCount,
      archiveCount,
    };
  }

  /**
   * Get a specific article by its ID
   */
  async getArticle(articleId: string): Promise<FeedEntry | null> {
    // The API doesn't have a direct endpoint for single articles,
    // so we need to paginate through the feed to find it
    const afterTimestamp = "1970-01-01T00:00:00.000000+00:00";
    let page = 1;
    let hasMore = true;

    // Exact match only: ids are the numeric content id the list shows (or the
    // feed entry's own id). parseInt would make "123abc" resolve to article 123.
    const wanted = articleId.trim();

    while (hasMore) {
      const url = `/library_items/updates_feed/?after_timestamp=${encodeURIComponent(afterTimestamp)}&page=${page}`;
      const feedResponse: FeedResponse = await this.request<FeedResponse>(url);

      const article = feedResponse.feed.find(
        (entry: FeedEntry) => entry.id === wanted || String(entry.content.id) === wanted
      );

      if (article) {
        return article;
      }

      hasMore = feedResponse.next !== null;
      page++;
    }

    return null;
  }

  /**
   * Save a new article to the Matter queue. This is the `/save/` route the
   * web app itself posts to; `web.getmatter.com/api/save` is that app's own
   * Next.js handler and answers 403 to anything that isn't the browser.
   */
  async saveArticle(url: string): Promise<SaveArticleResponse> {
    return this.request<SaveArticleResponse>("/save/", {
      method: "POST",
      body: JSON.stringify({
        url,
        user_agent: "Matter MCP Server/1.0",
      }),
    });
  }

  /**
   * Start the QR code login flow; the user scans the returned session token
   * with the Matter app. The client type decides what the resulting tokens may
   * do: "integration" (what the Obsidian plugin uses) is read-only and gets
   * "You do not have permission" from /save/, so ask for a "web" token, which
   * can do everything the web app can.
   */
  static async triggerQRLogin(): Promise<QRLoginResponse> {
    const response = await fetch(`${API_BASE}/qr_login/trigger/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ client_type: "web" }),
    });

    if (!response.ok) {
      throw new MatterAPIError(
        "Failed to initiate QR login",
        response.status
      );
    }

    return response.json() as Promise<QRLoginResponse>;
  }

  /**
   * Static method to exchange QR session token for access tokens
   * Poll this after user scans QR code
   */
  static async exchangeQRToken(sessionToken: string): Promise<QRExchangeResponse> {
    const response = await fetch(`${API_BASE}/qr_login/exchange/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session_token: sessionToken }),
    });

    if (!response.ok) {
      throw new MatterAPIError(
        "Failed to exchange QR token",
        response.status
      );
    }

    return response.json() as Promise<QRExchangeResponse>;
  }
}
