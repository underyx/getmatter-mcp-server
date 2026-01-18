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

// Library state enum values from the API
export enum LibraryState {
  QUEUE = 1,
  LATER = 2,
  ARCHIVE = 3,
  FEED = 4,
}

export function libraryStateToString(state: number): string {
  switch (state) {
    case LibraryState.QUEUE:
      return "QUEUE";
    case LibraryState.LATER:
      return "LATER";
    case LibraryState.ARCHIVE:
      return "ARCHIVE";
    case LibraryState.FEED:
      return "FEED";
    default:
      return "UNKNOWN";
  }
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

export interface SaveArticleResponse {
  id: number;
  content_id: number;
}

class MatterAPIError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: unknown
  ) {
    super(message);
    this.name = "MatterAPIError";
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
          throw new MatterAPIError(
            `Request failed after token refresh: ${retryResponse.statusText}`,
            retryResponse.status
          );
        }
        return retryResponse.json() as Promise<T>;
      }
      throw new MatterAPIError("Authentication failed", 401);
    }

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }
      throw new MatterAPIError(
        `Request failed: ${response.statusText}`,
        response.status,
        errorBody
      );
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
   * Get all articles from the user's library (updates feed)
   * Supports pagination through the feed
   */
  async getArticles(options?: {
    limit?: number;
    page?: number;
    afterTimestamp?: string;
  }): Promise<{ articles: FeedEntry[]; nextUrl: string | null; queueCount?: number; archiveCount?: number }> {
    const allArticles: FeedEntry[] = [];
    const limit = options?.limit || 100;
    let page = options?.page || 1;

    // Use a very old timestamp to get all articles, or use provided timestamp
    const afterTimestamp = options?.afterTimestamp || "1970-01-01T00:00:00.000000+00:00";

    let hasMore = true;
    let queueCount: number | undefined;
    let archiveCount: number | undefined;

    while (hasMore && allArticles.length < limit) {
      const url = `/library_items/updates_feed/?after_timestamp=${encodeURIComponent(afterTimestamp)}&page=${page}`;
      const response: FeedResponse = await this.request<FeedResponse>(url);

      allArticles.push(...response.feed);

      // Store counts from first response
      if (page === 1) {
        queueCount = response.queue_count;
        archiveCount = response.archive_count;
      }

      hasMore = response.next !== null;
      page++;

      if (allArticles.length >= limit) {
        return {
          articles: allArticles.slice(0, limit),
          nextUrl: response.next,
          queueCount,
          archiveCount,
        };
      }
    }

    return {
      articles: allArticles,
      nextUrl: null,
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

    // Parse the articleId - it could be a string like "111847745" or a number
    const numericId = parseInt(articleId, 10);

    while (hasMore) {
      const url = `/library_items/updates_feed/?after_timestamp=${encodeURIComponent(afterTimestamp)}&page=${page}`;
      const feedResponse: FeedResponse = await this.request<FeedResponse>(url);

      const article = feedResponse.feed.find(
        (entry: FeedEntry) =>
          entry.id === articleId ||
          entry.content.id === numericId ||
          String(entry.content.id) === articleId
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
   * Save a new article to Matter queue
   * Uses the web.getmatter.com/api/save endpoint
   */
  async saveArticle(url: string): Promise<SaveArticleResponse> {
    const response = await this.request<SaveArticleResponse>(
      "https://web.getmatter.com/api/save",
      {
        method: "POST",
        body: JSON.stringify({
          url,
          user_agent: "Matter MCP Server/1.0",
        }),
      }
    );
    return response;
  }

  /**
   * Static method to initiate QR code login flow
   * Returns a session token and QR code URL for the user to scan
   */
  static async triggerQRLogin(): Promise<QRLoginResponse> {
    const response = await fetch(`${API_BASE}/qr_login/trigger/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ client_type: "integration" }),
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
