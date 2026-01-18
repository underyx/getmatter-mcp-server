/**
 * Matter API Client
 *
 * Based on reverse-engineered API from the Obsidian Matter plugin
 * @see https://github.com/getmatterapp/obsidian-matter
 */

const API_BASE = "https://api.getmatter.app/api/v11";

export interface MatterTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LibraryEntry {
  library_state: number;
}

export interface Author {
  any_name: string | null;
  domain?: string | null;
  url?: string | null;
  image_url?: string | null;
}

export interface Publisher {
  any_name?: string | null;
  name?: string;
  domain?: string;
  url?: string | null;
  favicon_url?: string | null;
}

export interface Tag {
  name: string;
  created_date?: string;
}

export interface Annotation {
  id?: string;
  text: string;
  note: string | null;
  created_date: string;
  word_start: number;
  word_end: number;
}

export interface ContentNote {
  note: string;
}

export interface Content {
  id?: string;
  url: string;
  title: string;
  author: Author;
  publisher: Publisher;
  publication_date: string | null;
  library?: LibraryEntry | null;
  tags?: Tag[];
  my_tags?: Tag[];
  my_annotations?: Annotation[];
  my_note?: ContentNote | string | null;
  created_date?: string;
  reading_progress?: number;
  image_url?: string | null;
  word_count?: number | null;
}

export interface FeedEntry {
  id: string;
  content: Content;
  annotations: Annotation[];
  feed_context: unknown | null;
}

export interface FeedResponse {
  id: string;
  feed: FeedEntry[];
  next: string | null;
  previous: string | null;
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
  id: string;
  content_url: string;
  status: string;
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
   * Get all articles from the user's library
   * Supports pagination through the feed
   */
  async getArticles(options?: {
    limit?: number;
    nextUrl?: string;
  }): Promise<{ articles: FeedEntry[]; nextUrl: string | null }> {
    const allArticles: FeedEntry[] = [];
    // Use the queue feed which should return all saved articles
    let currentUrl: string | null = options?.nextUrl || "/library_items/queue_feed/";
    const limit = options?.limit || 100;

    while (currentUrl && allArticles.length < limit) {
      const response: FeedResponse = await this.request<FeedResponse>(currentUrl);
      allArticles.push(...response.feed);
      currentUrl = response.next;

      if (allArticles.length >= limit) {
        return {
          articles: allArticles.slice(0, limit),
          nextUrl: response.next,
        };
      }
    }

    return {
      articles: allArticles,
      nextUrl: currentUrl,
    };
  }

  /**
   * Get a specific article by its ID
   */
  async getArticle(articleId: string): Promise<FeedEntry | null> {
    // The API doesn't have a direct endpoint for single articles,
    // so we need to paginate through the feed to find it
    let currentUrl: string | null = "/library_items/queue_feed/";

    while (currentUrl) {
      const feedResponse: FeedResponse = await this.request<FeedResponse>(currentUrl);
      const article = feedResponse.feed.find(
        (entry: FeedEntry) => entry.id === articleId || entry.content.id === articleId
      );

      if (article) {
        return article;
      }

      currentUrl = feedResponse.next;
    }

    return null;
  }

  /**
   * Save a new article to Matter queue
   * Note: This endpoint is based on reverse-engineering and may change
   */
  async saveArticle(url: string): Promise<SaveArticleResponse> {
    const response = await this.request<SaveArticleResponse>(
      "/library_items/queue_entries/",
      {
        method: "POST",
        body: JSON.stringify({ content_url: url }),
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
