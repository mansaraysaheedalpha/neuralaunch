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

  async execute(
    params: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    const { query, maxResults = 5 } = params;
    const startTime = Date.now();

    try {
      this.logExecution("Searching web", { query, maxResults });

      // Try Brave Search first, fallback to DuckDuckGo
      let searchResults;

      if (process.env.BRAVE_SEARCH_API_KEY) {
        try {
          searchResults = await this.searchWithBrave(query, maxResults);
          logger.info("[WebSearchTool] Used Brave Search API");
        } catch (braveError) {
          logger.warn(
            "[WebSearchTool] Brave Search failed, falling back to DuckDuckGo",
            {
              error:
                braveError instanceof Error ? braveError.message : "Unknown",
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
  ): Promise<{
    results: Array<{ title: string; url: string; description: string }>;
    total: number;
  }> {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;

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

      const data = await response.json();

      const results = (data.web?.results || []).map((result: any) => ({
        title: result.title,
        url: result.url,
        description: result.description || result.snippet || "",
      }));

      return {
        results,
        total: data.web?.results?.length || 0,
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
  ): Promise<{
    results: Array<{ title: string; url: string; description: string }>;
    total: number;
  }> {
    try {
      // Use DuckDuckGo Instant Answer API (free, no key)
      const response = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
      );

      if (!response.ok) {
        throw new Error(`DuckDuckGo API error: ${response.status}`);
      }

      const data = await response.json();

      const results: Array<{
        title: string;
        url: string;
        description: string;
      }> = [];

      // Add abstract if available
      if (data.AbstractURL && data.AbstractText) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL,
          description: data.AbstractText,
        });
      }

      // Add related topics
      if (data.RelatedTopics) {
        data.RelatedTopics.slice(0, maxResults - results.length).forEach(
          (topic: any) => {
            if (topic.FirstURL && topic.Text) {
              results.push({
                title: topic.Text.split(" - ")[0] || topic.Text,
                url: topic.FirstURL,
                description: topic.Text,
              });
            }
          }
        );
      }

      return {
        results: results.slice(0, maxResults),
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
