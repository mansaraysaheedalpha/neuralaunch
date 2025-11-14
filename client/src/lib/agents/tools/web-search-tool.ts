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
          searchResults = await this.searchWithDuckDuckGo(query, maxResults);
        }
      } else {
        logger.info("[WebSearchTool] No Brave API key, using DuckDuckGo");
        searchResults = await this.searchWithDuckDuckGo(query, maxResults);
      }

      return {
        success: true,
        data: {
          query,
          results: searchResults.results,
          totalResults: searchResults.total,
        },
        metadata: {
          executionTime: Date.now() - startTime,
        },
      };
    } catch (error) {
      this.logError("Web search", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Primary: Search using Brave Search API
   * Get API key: https://brave.com/search/api/
   * Free tier: 2000 queries/month
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
      const response = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`,
        {
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": apiKey,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Brave Search API error: ${response.status}`);
      }

      const data: unknown = await response.json();
      const results = normalizeBraveResults(data, maxResults);

      return {
        results,
        total: results.length,
      };
    } catch (error) {
      throw new Error(
        `Brave Search failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Fallback: DuckDuckGo HTML scraping
   * Free, no API key needed
   */
  private async searchWithDuckDuckGo(
    query: string,
    maxResults: number
  ): Promise<SearchResponseData> {
    try {
      // Use DuckDuckGo Instant Answer API (free, no key)
      const response = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
      );

      if (!response.ok) {
        throw new Error(`DuckDuckGo API error: ${response.status}`);
      }

      const data: unknown = await response.json();
      const results = normalizeDuckDuckGoResults(data, query, maxResults);

      return {
        results,
        total: results.length,
      };
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
