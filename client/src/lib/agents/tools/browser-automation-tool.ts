// src/lib/agents/tools/browser-automation-tool.ts
/**
 * Browser Automation Tool
 * Uses Puppeteer for web scraping, screenshots, form filling, and testing
 *
 * CAPABILITIES:
 * - Screenshot websites
 * - Scrape dynamic content (JavaScript-rendered pages)
 * - Fill forms and test UI flows
 * - Verify deployments
 * - Extract data from SPAs
 */

import { BaseTool, ToolParameter, ToolResult, ToolContext } from "./base-tool";
import { logger } from "@/lib/logger";
import chromium from "@sparticuz/chromium";

// Dynamically import puppeteer-core (already in your dependencies)
let puppeteer: any;

// Lazy load puppeteer to avoid bundling issues
async function getPuppeteer() {
  if (!puppeteer) {
    puppeteer = await import("puppeteer-core");
  }
  return puppeteer;
}

interface BrowserAutomationResult {
  success: boolean;
  data?: {
    screenshot?: string; // Base64 encoded
    html?: string;
    text?: string;
    title?: string;
    url?: string;
    metadata?: Record<string, any>;
    formSubmitted?: boolean;
    elementFound?: boolean;
    consoleErrors?: string[];
  };
  error?: string;
}

export class BrowserAutomationTool extends BaseTool {
  name = "browser_automation";
  description =
    "Automate browser tasks: screenshots, scraping, form filling, UI testing";

  parameters: ToolParameter[] = [
    {
      name: "operation",
      type: "string",
      description:
        'Operation: "screenshot", "scrape", "fill_form", "click", "verify_deployment", "extract_data"',
      required: true,
    },
    {
      name: "url",
      type: "string",
      description: "URL to visit",
      required: true,
    },
    {
      name: "selector",
      type: "string",
      description: "CSS selector for element (required for click, fill_form)",
      required: false,
    },
    {
      name: "value",
      type: "string",
      description: "Value to fill in form field",
      required: false,
    },
    {
      name: "waitForSelector",
      type: "string",
      description: "Wait for this selector before taking action",
      required: false,
    },
    {
      name: "timeout",
      type: "number",
      description: "Timeout in milliseconds (default: 30000)",
      required: false,
      default: 30000,
    },
    {
      name: "fullPage",
      type: "boolean",
      description: "Take full page screenshot (default: true)",
      required: false,
      default: true,
    },
  ];

  async execute(
    params: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    const {
      operation,
      url,
      selector,
      value,
      waitForSelector,
      timeout = 30000,
      fullPage = true,
    } = params;

    const startTime = Date.now();

    try {
      this.logExecution("Browser automation", { operation, url });

      // Validate URL
      if (!this.isValidUrl(url)) {
        return {
          success: false,
          error: `Invalid URL: ${url}`,
        };
      }

      switch (operation) {
        case "screenshot":
          return await this.takeScreenshot(url, {
            waitForSelector,
            timeout,
            fullPage,
          });

        case "scrape":
          return await this.scrapePage(url, { waitForSelector, timeout });

        case "fill_form":
          if (!selector || value === undefined) {
            return {
              success: false,
              error: "fill_form requires 'selector' and 'value' parameters",
            };
          }
          return await this.fillForm(url, selector, value, {
            waitForSelector,
            timeout,
          });

        case "click":
          if (!selector) {
            return {
              success: false,
              error: "click requires 'selector' parameter",
            };
          }
          return await this.clickElement(url, selector, {
            waitForSelector,
            timeout,
          });

        case "verify_deployment":
          return await this.verifyDeployment(url, { timeout });

        case "extract_data":
          return await this.extractData(url, selector, {
            waitForSelector,
            timeout,
          });

        default:
          return {
            success: false,
            error: `Unknown operation: ${operation}`,
          };
      }
    } catch (error) {
      this.logError("Browser automation", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Take a screenshot of a webpage
   */
  private async takeScreenshot(
    url: string,
    options: {
      waitForSelector?: string;
      timeout?: number;
      fullPage?: boolean;
    }
  ): Promise<ToolResult> {
    const browser = await this.launchBrowser();

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // Navigate to URL
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: options.timeout || 30000,
      });

      // Wait for specific selector if provided
      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, {
          timeout: options.timeout || 30000,
        });
      }

      // Take screenshot
      const screenshot = await page.screenshot({
        fullPage: options.fullPage !== false,
        encoding: "base64",
      });

      const title = await page.title();
      const finalUrl = page.url();

      await browser.close();

      return {
        success: true,
        data: {
          screenshot: screenshot as string,
          title,
          url: finalUrl,
        },
        metadata: {
          executionTime: Date.now() - Date.now(),
        },
      };
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  /**
   * Scrape page content (handles JavaScript-rendered content)
   */
  private async scrapePage(
    url: string,
    options: { waitForSelector?: string; timeout?: number }
  ): Promise<ToolResult> {
    const browser = await this.launchBrowser();

    try {
      const page = await browser.newPage();

      // Capture console errors
      const consoleErrors: string[] = [];
      page.on("console", (msg: any) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: options.timeout || 30000,
      });

      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, {
          timeout: options.timeout || 30000,
        });
      }

      // Extract content
      const title = await page.title();
      const html = await page.content();
      const text = await page.evaluate(
        () => document.body.innerText || document.body.textContent || ""
      );

      // Extract metadata
      const metadata = await page.evaluate(() => {
        const meta: Record<string, string> = {};

        // Get meta tags
        document.querySelectorAll("meta").forEach((tag) => {
          const name = tag.getAttribute("name") || tag.getAttribute("property");
          const content = tag.getAttribute("content");
          if (name && content) {
            meta[name] = content;
          }
        });

        return meta;
      });

      await browser.close();

      return {
        success: true,
        data: {
          title,
          html,
          text: text.substring(0, 10000), // Limit to 10KB
          url: page.url(),
          metadata,
          consoleErrors:
            consoleErrors.length > 0 ? consoleErrors.slice(0, 10) : undefined,
        },
      };
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  /**
   * Fill a form field
   */
  private async fillForm(
    url: string,
    selector: string,
    value: string,
    options: { waitForSelector?: string; timeout?: number }
  ): Promise<ToolResult> {
    const browser = await this.launchBrowser();

    try {
      const page = await browser.newPage();
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: options.timeout || 30000,
      });

      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, {
          timeout: options.timeout || 30000,
        });
      }

      // Wait for the target selector
      await page.waitForSelector(selector, {
        timeout: options.timeout || 30000,
      });

      // Fill the form field
      await page.type(selector, value);

      await browser.close();

      return {
        success: true,
        data: {
          formSubmitted: true,
          url: page.url(),
        },
      };
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  /**
   * Click an element
   */
  private async clickElement(
    url: string,
    selector: string,
    options: { waitForSelector?: string; timeout?: number }
  ): Promise<ToolResult> {
    const browser = await this.launchBrowser();

    try {
      const page = await browser.newPage();
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: options.timeout || 30000,
      });

      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, {
          timeout: options.timeout || 30000,
        });
      }

      await page.waitForSelector(selector, {
        timeout: options.timeout || 30000,
      });

      await page.click(selector);

      // Wait a bit for any navigation or changes
      await page.waitForTimeout(1000);

      const finalUrl = page.url();

      await browser.close();

      return {
        success: true,
        data: {
          elementFound: true,
          url: finalUrl,
        },
      };
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  /**
   * Verify deployment is live and responding
   */
  private async verifyDeployment(
    url: string,
    options: { timeout?: number }
  ): Promise<ToolResult> {
    const browser = await this.launchBrowser();

    try {
      const page = await browser.newPage();

      // Check if page loads
      const response = await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: options.timeout || 30000,
      });

      const statusCode = response?.status() || 0;
      const isSuccessful = statusCode >= 200 && statusCode < 400;

      const title = await page.title();
      const html = await page.content();

      // Check for common error indicators
      const hasErrors = await page.evaluate(() => {
        const bodyText = document.body.textContent || "";
        return (
          bodyText.includes("404") ||
          bodyText.includes("Error") ||
          bodyText.includes("not found")
        );
      });

      await browser.close();

      return {
        success: isSuccessful && !hasErrors,
        data: {
          url,
          title,
          metadata: {
            statusCode,
            hasErrors,
            htmlLength: html.length,
          },
        },
      };
    } catch (error) {
      await browser.close();
      return {
        success: false,
        error: `Deployment verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Extract specific data from page
   */
  private async extractData(
    url: string,
    selector?: string,
    options?: { waitForSelector?: string; timeout?: number }
  ): Promise<ToolResult> {
    const browser = await this.launchBrowser();

    try {
      const page = await browser.newPage();
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: options?.timeout || 30000,
      });

      if (options?.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, {
          timeout: options.timeout || 30000,
        });
      }

      let extractedData: any;

      if (selector) {
        // Extract specific element
        extractedData = await page.evaluate((sel: any) => {
          const element = document.querySelector(sel);
          if (!element) return null;

          return {
            text: element.textContent?.trim(),
            html: element.innerHTML,
            attributes: Array.from(element.attributes).reduce(
              (acc: any, attr: any) => {
                acc[attr.name] = attr.value;
                return acc;
              },
              {}
            ),
          };
        }, selector);
      } else {
        // Extract structured data (JSON-LD, meta tags, etc.)
        extractedData = await page.evaluate(() => {
          const data: any = {};

          // Extract JSON-LD
          const jsonLdScripts = document.querySelectorAll(
            'script[type="application/ld+json"]'
          );
          if (jsonLdScripts.length > 0) {
            data.jsonLd = Array.from(jsonLdScripts).map((script) => {
              try {
                return JSON.parse(script.textContent || "");
              } catch {
                return null;
              }
            });
          }

          // Extract Open Graph tags
          const ogTags: Record<string, string> = {};
          document
            .querySelectorAll('meta[property^="og:"]')
            .forEach((tag: any) => {
              ogTags[tag.getAttribute("property")] =
                tag.getAttribute("content");
            });
          if (Object.keys(ogTags).length > 0) {
            data.openGraph = ogTags;
          }

          return data;
        });
      }

      await browser.close();

      return {
        success: true,
        data: extractedData,
      };
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  /**
   * Launch browser with appropriate configuration
   */
  private async launchBrowser() {
    const pptr = await getPuppeteer();

    // Production (Vercel) vs Development
    const isProduction = process.env.NODE_ENV === "production";

    if (isProduction) {
      // Use Sparticuz Chromium for Vercel
      return await pptr.launch({
        args: chromium.args,
        defaultViewport: (chromium as any).defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: (chromium as any).headless,
      });
    } else {
      // Local development - use system Chrome
      return await pptr.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
      });
    }
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  protected getExamples(): string[] {
    return [
      '// Take screenshot\n{ "operation": "screenshot", "url": "https://example.com" }',
      '// Scrape page content\n{ "operation": "scrape", "url": "https://example.com", "waitForSelector": "#content" }',
      '// Fill form\n{ "operation": "fill_form", "url": "https://example.com", "selector": "input[name=email]", "value": "test@example.com" }',
      '// Verify deployment\n{ "operation": "verify_deployment", "url": "https://your-app.vercel.app" }',
      '// Extract data\n{ "operation": "extract_data", "url": "https://example.com", "selector": ".product-price" }',
    ];
  }
}
