// src/lib/agents/tools/web-search-tool.ts
/**
 * Web Search Tool - PRODUCTION READY
 * Enables agents to search the web for:
 * - Error solutions
 * - Documentation
 * - Best practices
 * - Package information
 *
 * Primary: Brave Search API (2000 queries/month free)
 * Fallback: DuckDuckGo HTML scraping (free, no key needed)
 */

import { BaseTool, ToolParameter, ToolResult, ToolContext } from "./base-tool";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { retryWithBackoff, RetryPresets } from "@/lib/ai-retry";

interface SearchResult {
  title: string;
  url: string;
  description: string;
}

interface SearchResponseData {
  results: SearchResult[];
  total: number;
}

interface WebSearchParams {
  query: string;
  maxResults: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clampMaxResults(value: number): number {
  const rounded = Math.floor(value);
  if (Number.isNaN(rounded) || rounded <= 0) {
    throw new Error("maxResults must be a positive integer");
  }
  return Math.min(rounded, 20);
}

function normalizeBraveResults(payload: unknown, maxResults: number): SearchResult[] {
  if (!isRecord(payload)) {
    throw new Error("Brave Search response is malformed");
  }

  const webSection = payload.web;
  if (!isRecord(webSection)) {
    return [];
  }

  const rawResults = webSection.results;
  if (!Array.isArray(rawResults)) {
    return [];
  }

  const results: SearchResult[] = [];

  for (const raw of rawResults) {
    if (!isRecord(raw)) {
      continue;
    }

    const title = typeof raw.title === "string" ? raw.title : undefined;
    const url = typeof raw.url === "string" ? raw.url : undefined;
    const description =
      typeof raw.description === "string"
        ? raw.description
        : typeof raw.snippet === "string"
        ? raw.snippet
        : "";

    if (title && url) {
      results.push({ title, url, description });
    }

    if (results.length >= maxResults) {
      break;
    }
  }

  return results;
}

function collectDuckDuckGoTopics(
  topics: unknown,
  results: SearchResult[],
  maxResults: number
): void {
  if (!Array.isArray(topics)) {
    return;
  }

  for (const topic of topics) {
    if (results.length >= maxResults) {
      return;
    }

    if (!isRecord(topic)) {
      continue;
    }

    const nested = topic.Topics;
    if (Array.isArray(nested)) {
      collectDuckDuckGoTopics(nested, results, maxResults);
      if (results.length >= maxResults) {
        return;
      }
    }

    const firstUrl = typeof topic.FirstURL === "string" ? topic.FirstURL : undefined;
    const text = typeof topic.Text === "string" ? topic.Text : undefined;

    if (firstUrl && text) {
      const title = text.split(" - ")[0] || text;
      results.push({
        title,
        url: firstUrl,
        description: text,
      });
    }
  }
}

function normalizeDuckDuckGoResults(
  payload: unknown,
  query: string,
  maxResults: number
): SearchResult[] {
  if (!isRecord(payload)) {
    throw new Error("DuckDuckGo response is malformed");
  }

  const results: SearchResult[] = [];
  const abstractUrl = typeof payload.AbstractURL === "string" ? payload.AbstractURL : undefined;
  const abstractText =
    typeof payload.AbstractText === "string" ? payload.AbstractText : undefined;
  const heading = typeof payload.Heading === "string" ? payload.Heading : undefined;

  if (abstractUrl && abstractText) {
    results.push({
      title: heading || query,
      url: abstractUrl,
      description: abstractText,
    });
  }

  collectDuckDuckGoTopics(payload.RelatedTopics, results, maxResults);

  return results.slice(0, maxResults);
}

export class WebSearchTool extends BaseTool {
  name = "web_search";
  description =
    "Search the web for documentation, error solutions, and best practices";

  parameters: ToolParameter[] = [
    {
      name: "query",
      type: "string",
      description: "Search query (error message, topic, or question)",
      required: true,
    },
    {
      name: "maxResults",
      type: "number",
      description: "Maximum number of results to return (default: 5)",
      required: false,
      default: 5,
    },
  ];

  private parseParams(params: Record<string, unknown>): WebSearchParams {
    const query = params.query;
    if (typeof query !== "string" || !query.trim()) {
      throw new Error("query parameter is required");
    }

    const maxResultsRaw = params.maxResults;
    const maxResults =
      maxResultsRaw === undefined
        ? 5
        : clampMaxResults(
            typeof maxResultsRaw === "number"
              ? maxResultsRaw
              : Number(maxResultsRaw)
          );

    return { query: query.trim(), maxResults };
  }

  async execute(
    params: Record<string, unknown>,
    _context: ToolContext
  ): Promise<ToolResult> {
    const { query, maxResults } = this.parseParams(params);
    const startTime = Date.now();

    try {
      this.logExecution("Searching web", { query, maxResults });

      // Try Brave Search first, fallback to DuckDuckGo
      let searchResults: SearchResponseData;

      if (env.BRAVE_SEARCH_API_KEY) {
        try {
          searchResults = await this.searchWithBrave(query, maxResults);
          logger.info("[WebSearchTool] Used Brave Search API");
        } catch (braveError) {
          logger.warn(
            "[WebSearchTool] Brave Search failed, falling back to DuckDuckGo",
            {
              error:
                braveError instanceof Error
                  ? braveError.message
                  : String(braveError),
            }
          );
          // Add retry with exponential backoff for DuckDuckGo fallback
          try {
            searchResults = await this.searchWithDuckDuckGo(query, maxResults);
          } catch (ddgError) {
            logger.error("[WebSearchTool] DuckDuckGo also failed", 
              ddgError instanceof Error ? ddgError : new Error(String(ddgError))
            );
            // Return empty results instead of failing completely
            searchResults = { results: [], total: 0 };
          }
        }
      } else {
        logger.info("[WebSearchTool] No Brave API key, using DuckDuckGo");
        try {
          searchResults = await this.searchWithDuckDuckGo(query, maxResults);
        } catch (ddgError) {
          logger.error("[WebSearchTool] DuckDuckGo failed", 
            ddgError instanceof Error ? ddgError : new Error(String(ddgError))
          );
          // Return empty results instead of failing completely
          searchResults = { results: [], total: 0 };
        }
      }

      // Always return success with whatever results we got (even if empty)
      return {
        success: true,
        data: {
          query,
          results: searchResults.results,
          totalResults: searchResults.total,
          note: searchResults.total === 0 ? "No results found. This is not an error - web search may be temporarily unavailable or query returned no results." : undefined,
        },
        metadata: {
          executionTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      this.logError("Web search", error);
      // Return success with empty results instead of failure
      // This allows agents to continue without web search
      logger.warn("[WebSearchTool] Returning empty results to allow agent to continue");
      return {
        success: true,
        data: {
          query,
          results: [],
          totalResults: 0,
          note: "Web search failed but continuing execution. Error: " + (error instanceof Error ? error.message : "Unknown error"),
        },
        metadata: {
          executionTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Primary: Search using Brave Search API
   * Get API key: https://brave.com/search/api/
   * Free tier: 2000 queries/month
   * ✅ ENHANCED: Added retry logic with exponential backoff
   */
  private async searchWithBrave(
    query: string,
    maxResults: number
  ): Promise<SearchResponseData> {
    const apiKey = env.BRAVE_SEARCH_API_KEY;

    if (!apiKey) {
      throw new Error("BRAVE_SEARCH_API_KEY not configured");
    }

    try {
      // ✅ Wrap with retry logic
      return await retryWithBackoff(
        async () => {
          const response = await fetch(
            `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`,
            {
              headers: {
                Accept: "application/json",
                "Accept-Encoding": "gzip",
                "X-Subscription-Token": apiKey,
              },
              signal: AbortSignal.timeout(10000), // 10s timeout per request
            }
          );

          // Handle specific error codes
          if (response.status === 422) {
            // Validation error - not retryable, likely bad query format
            const errorText = await response.text().catch(() => "No error details");
            logger.warn("[WebSearchTool] Brave Search validation error (422)", {
              query,
              error: errorText.substring(0, 200),
            });
            throw new Error(`Brave Search validation error: ${errorText.substring(0, 100)}`);
          }

          if (response.status === 429) {
            // Rate limit - retryable
            throw new Error(`Brave Search rate limit exceeded (429)`);
          }

          if (!response.ok) {
            throw new Error(`Brave Search API error: ${response.status}`);
          }

          // Check content type before parsing
          const contentType = response.headers.get("content-type") || "";
          if (!contentType.includes("application/json")) {
            throw new Error(`Brave Search returned non-JSON response: ${contentType}`);
          }

          const text = await response.text();
          if (!text || text.trim().length === 0) {
            throw new Error("Brave Search returned empty response");
          }

          let data: unknown;
          try {
            data = JSON.parse(text);
          } catch {
            logger.error("[WebSearchTool] Failed to parse Brave Search response", undefined, {
              responsePreview: text.substring(0, 200),
            });
            throw new Error("Brave Search returned invalid JSON");
          }

          const results = normalizeBraveResults(data, maxResults);

          return {
            results,
            total: results.length,
          };
        },
        {
          ...RetryPresets.QUICK, // Quick retry for web searches
          operationName: "Brave Search",
          // Don't retry validation errors (422)
          isRetryable: (error: Error) => {
            const message = error.message.toLowerCase();
            return (
              !message.includes("validation") &&
              !message.includes("422") &&
              (message.includes("429") ||
                message.includes("timeout") ||
                message.includes("503") ||
                message.includes("502") ||
                message.includes("network") ||
                message.includes("econnreset"))
            );
          },
        }
      );
    } catch (error) {
      throw new Error(
        `Brave Search failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Fallback: DuckDuckGo Instant Answer API
   * Free, no API key needed
   * ✅ ENHANCED: Added retry logic and better error handling
   */
  private async searchWithDuckDuckGo(
    query: string,
    maxResults: number
  ): Promise<SearchResponseData> {
    try {
      // ✅ Wrap with retry logic
      return await retryWithBackoff(
        async () => {
          // Use DuckDuckGo Instant Answer API (free, no key)
          const response = await fetch(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
            {
              headers: {
                "User-Agent": "NeuraLaunch/1.0",
                Accept: "application/json",
              },
              signal: AbortSignal.timeout(10000), // 10s timeout per request
            }
          );

          if (!response.ok) {
            throw new Error(`DuckDuckGo API error: ${response.status}`);
          }

          // ✅ ENHANCED: Better JSON parsing with error handling
          const text = await response.text();

          // Check for empty response
          if (!text || text.trim().length === 0) {
            logger.warn("[WebSearchTool] DuckDuckGo returned empty response", { query });
            // Return empty results instead of throwing
            return {
              results: [],
              total: 0,
            };
          }

          let data: unknown;
          try {
            data = JSON.parse(text);
          } catch (parseError) {
            logger.error(
              "[WebSearchTool] Failed to parse DuckDuckGo response",
              undefined,
              {
                responsePreview: text.substring(0, 200),
                parseError: parseError instanceof Error ? parseError.message : "Unknown",
              }
            );
            // Return empty results instead of throwing
            return {
              results: [],
              total: 0,
            };
          }

          // DuckDuckGo sometimes returns empty JSON object for no results
          if (!data || (typeof data === "object" && Object.keys(data).length === 0)) {
            logger.info("[WebSearchTool] DuckDuckGo returned no results", { query });
            return {
              results: [],
              total: 0,
            };
          }

          const results = normalizeDuckDuckGoResults(data, query, maxResults);

          return {
            results,
            total: results.length,
          };
        },
        {
          ...RetryPresets.QUICK, // Quick retry for web searches
          operationName: "DuckDuckGo Search",
          // Retry on network/timeout errors, but not on empty responses
          isRetryable: (error: Error) => {
            const message = error.message.toLowerCase();
            return (
              message.includes("timeout") ||
              message.includes("503") ||
              message.includes("502") ||
              message.includes("network") ||
              message.includes("econnreset") ||
              message.includes("econnrefused")
            );
          },
        }
      );
    } catch (error) {
      throw new Error(
        `DuckDuckGo search failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  protected getExamples(): string[] {
    return [
      '// Search for error solution\n{ "query": "TypeError: Cannot read property of undefined React hooks", "maxResults": 5 }',
      '// Search for documentation\n{ "query": "Next.js 14 server actions documentation", "maxResults": 3 }',
      '// Search for best practices\n{ "query": "TypeScript strict mode best practices", "maxResults": 5 }',
      '// Search for package info\n{ "query": "npm zod installation guide", "maxResults": 3 }',
    ];
  }
}
