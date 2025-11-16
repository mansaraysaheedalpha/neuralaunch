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
import chromium from "@sparticuz/chromium";
import { env } from "@/lib/env";
import { toError } from "@/lib/error-utils";
import type {
  Browser,
  ConsoleMessage,
  HTTPResponse,
  LaunchOptions,
  Page,
} from "puppeteer-core";

type HeadlessMode = boolean | "shell";

interface ChromiumRuntimeConfig {
  defaultViewport?: unknown;
  headless?: unknown;
}

const chromiumRuntime = chromium as ChromiumRuntimeConfig;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const resolveViewport = (
  viewport: unknown
): LaunchOptions["defaultViewport"] => {
  if (viewport === null) {
    return null;
  }

  if (!isRecord(viewport)) {
    return undefined;
  }

  const { width, height } = viewport as {
    width?: unknown;
    height?: unknown;
  };

  if (typeof width === "number" && typeof height === "number") {
    return viewport as unknown as LaunchOptions["defaultViewport"];
  }

  return undefined;
};

const resolveHeadlessMode = (headless: unknown): HeadlessMode => {
  if (headless === "shell") {
    return headless;
  }

  if (typeof headless === "boolean") {
    return headless;
  }

  return true;
};

type JsonLdNode = Record<string, unknown> | Array<Record<string, unknown>>;

const parseJsonLd = (raw: string | null): JsonLdNode | null => {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      const normalized = parsed.filter(isRecord);
      return normalized.length > 0 ? normalized : null;
    }

    if (isRecord(parsed)) {
      return parsed;
    }
  } catch {
    // fall through to return null
  }

  return null;
};

type PuppeteerModule = typeof import("puppeteer-core");

let puppeteerModule: PuppeteerModule | undefined;

async function getPuppeteer(): Promise<PuppeteerModule> {
  if (!puppeteerModule) {
    puppeteerModule = await import("puppeteer-core");
  }
  return puppeteerModule;
}

type BrowserAutomationOperation =
  | "screenshot"
  | "scrape"
  | "fill_form"
  | "click"
  | "verify_deployment"
  | "extract_data";

interface BrowserAutomationParams {
  operation: BrowserAutomationOperation;
  url: string;
  selector?: string;
  value?: string;
  waitForSelector?: string;
  timeout?: number;
  fullPage?: boolean;
}

interface ScreenshotOptions {
  waitForSelector?: string;
  timeout?: number;
  fullPage?: boolean;
}

interface InteractionOptions {
  waitForSelector?: string;
  timeout?: number;
}

interface ExtractionOptions {
  waitForSelector?: string;
  timeout?: number;
}

interface ExtractedElementData {
  text: string | null;
  html: string | null;
  attributes: Record<string, string>;
}

interface StructuredExtractionResult {
  jsonLd?: Array<JsonLdNode | null>;
  openGraph?: Record<string, string>;
}

type ExtractionResult = ExtractedElementData | StructuredExtractionResult | null;

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_VIEWPORT = { width: 1920, height: 1080 };

function isBrowserAutomationOperation(
  value: string
): value is BrowserAutomationOperation {
  return (
    value === "screenshot" ||
    value === "scrape" ||
    value === "fill_form" ||
    value === "click" ||
    value === "verify_deployment" ||
    value === "extract_data"
  );
}

function resolveTimeout(timeout?: number): number {
  if (timeout === undefined) {
    return DEFAULT_TIMEOUT;
  }

  if (typeof timeout !== "number" || Number.isNaN(timeout) || timeout <= 0) {
    throw new Error("Timeout must be a positive number");
  }

  return timeout;
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
      default: DEFAULT_TIMEOUT,
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
    params: Record<string, unknown>,
    _context: ToolContext
  ): Promise<ToolResult> {
    const parsedParams = this.parseParams(params);
    const { operation, url } = parsedParams;

    this.logExecution("Browser automation", { operation, url });

    if (!this.isValidUrl(url)) {
      return {
        success: false,
        error: `Invalid URL: ${url}`,
      };
    }

    switch (operation) {
      case "screenshot":
        return this.takeScreenshot(url, {
          waitForSelector: parsedParams.waitForSelector,
          timeout: parsedParams.timeout,
          fullPage: parsedParams.fullPage,
        });
      case "scrape":
        return this.scrapePage(url, {
          waitForSelector: parsedParams.waitForSelector,
          timeout: parsedParams.timeout,
        });
      case "fill_form":
        if (!parsedParams.selector || parsedParams.value === undefined) {
          return {
            success: false,
            error: "fill_form requires 'selector' and 'value' parameters",
          };
        }
        return this.fillForm(url, parsedParams.selector, parsedParams.value, {
          waitForSelector: parsedParams.waitForSelector,
          timeout: parsedParams.timeout,
        });
      case "click":
        if (!parsedParams.selector) {
          return {
            success: false,
            error: "click requires 'selector' parameter",
          };
        }
        return this.clickElement(url, parsedParams.selector, {
          waitForSelector: parsedParams.waitForSelector,
          timeout: parsedParams.timeout,
        });
      case "verify_deployment":
        return this.verifyDeployment(url, { timeout: parsedParams.timeout });
      case "extract_data":
        return this.extractData(url, parsedParams.selector, {
          waitForSelector: parsedParams.waitForSelector,
          timeout: parsedParams.timeout,
        });
      default:
        return {
          success: false,
          error: "Unknown operation",
        };
    }
  }

  private parseParams(params: Record<string, unknown>): BrowserAutomationParams {
    const operationRaw = params.operation;
    if (typeof operationRaw !== "string" || !isBrowserAutomationOperation(operationRaw)) {
      throw new Error("Invalid or missing operation parameter");
    }

    const urlRaw = params.url;
    if (typeof urlRaw !== "string" || !urlRaw.trim()) {
      throw new Error("URL parameter is required");
    }

    const selector = typeof params.selector === "string" ? params.selector : undefined;
    const value = typeof params.value === "string" ? params.value : undefined;
    const waitForSelector =
      typeof params.waitForSelector === "string" ? params.waitForSelector : undefined;

    let timeout: number | undefined;
    if (params.timeout !== undefined) {
      if (typeof params.timeout !== "number") {
        throw new Error("timeout parameter must be a number");
      }
      timeout = resolveTimeout(params.timeout);
    }
    const fullPage =
      typeof params.fullPage === "boolean" ? params.fullPage : undefined;

    return {
      operation: operationRaw,
      url: urlRaw,
      selector,
      value,
      waitForSelector,
      timeout,
      fullPage,
    };
  }

  private async takeScreenshot(
    url: string,
    options: ScreenshotOptions
  ): Promise<ToolResult> {
    const start = Date.now();
    return this.withPage(async (page) => {
      await page.setViewport(DEFAULT_VIEWPORT);
      await this.navigate(page, url, options.waitForSelector, options.timeout);

      const screenshot = await page.screenshot({
        fullPage: options.fullPage ?? true,
        encoding: "base64",
      });

      if (typeof screenshot !== "string") {
        throw new Error("Failed to capture screenshot");
      }

      const title = await page.title();
      const finalUrl = page.url();

      return {
        success: true,
        data: {
          screenshot,
          title,
          url: finalUrl,
        },
        metadata: {
          executionTime: Date.now() - start,
        },
      };
    });
  }

  private async scrapePage(
    url: string,
    options: InteractionOptions
  ): Promise<ToolResult> {
    const consoleErrors: string[] = [];

    return this.withPage(async (page) => {
      page.on("console", (msg: ConsoleMessage) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      await this.navigate(page, url, options.waitForSelector, options.timeout);

      const title = await page.title();
      const html = await page.content();
      const rawText = await page.evaluate(
        () => document.body?.innerText ?? document.body?.textContent ?? ""
      );
      const text = typeof rawText === "string" ? rawText : "";

      const metadata = await page.evaluate(() => {
        const meta: Record<string, string> = {};

        document.querySelectorAll("meta").forEach((tag) => {
          const name = tag.getAttribute("name") ?? tag.getAttribute("property");
          const content = tag.getAttribute("content");
          if (name && content) {
            meta[name] = content;
          }
        });

        return meta;
      });

      return {
        success: true,
        data: {
          title,
          html,
          text: text.slice(0, 10000),
          url: page.url(),
          metadata,
          consoleErrors: consoleErrors.length > 0 ? consoleErrors.slice(0, 10) : undefined,
        },
      };
    });
  }

  private async fillForm(
    url: string,
    selector: string,
    value: string,
    options: InteractionOptions
  ): Promise<ToolResult> {
    return this.withPage(async (page) => {
      await this.navigate(page, url, options.waitForSelector, options.timeout);
      const timeout = resolveTimeout(options.timeout);
      await page.waitForSelector(selector, { timeout });
      await page.type(selector, value);

      return {
        success: true,
        data: {
          formSubmitted: true,
          url: page.url(),
        },
      };
    });
  }

  private async clickElement(
    url: string,
    selector: string,
    options: InteractionOptions
  ): Promise<ToolResult> {
    return this.withPage(async (page) => {
      await this.navigate(page, url, options.waitForSelector, options.timeout);
      const timeout = resolveTimeout(options.timeout);
      await page.waitForSelector(selector, { timeout });
      await page.click(selector);
      await delay(1000);

      return {
        success: true,
        data: {
          elementFound: true,
          url: page.url(),
        },
      };
    });
  }

  private async verifyDeployment(
    url: string,
    options: { timeout?: number }
  ): Promise<ToolResult> {
    return this.withPage(async (page) => {
      const timeout = resolveTimeout(options.timeout);
      const response: HTTPResponse | null = await page.goto(url, {
        waitUntil: "networkidle2",
        timeout,
      });

      const statusCode = response?.status() ?? 0;
      const isSuccessful = statusCode >= 200 && statusCode < 400;

      const title = await page.title();
      const html = await page.content();
      const hasErrors = await page.evaluate(() => {
        const bodyText = document.body?.textContent ?? "";
        const normalized = bodyText.toLowerCase();
        return (
          normalized.includes("404") ||
          normalized.includes("error") ||
          normalized.includes("not found")
        );
      });

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
    });
  }

  private async extractData(
    url: string,
    selector: string | undefined,
    options: ExtractionOptions
  ): Promise<ToolResult> {
    return this.withPage(async (page) => {
      await this.navigate(page, url, options.waitForSelector, options.timeout);

      const extracted: ExtractionResult = selector
        ? (await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (!element) {
              return null;
            }

            const attributes = Array.from(element.attributes).reduce<
              Record<string, string>
            >((acc, attr) => {
              acc[attr.name] = attr.value;
              return acc;
            }, {});

            return {
              text: element.textContent?.trim() ?? null,
              html: element.innerHTML ?? null,
              attributes,
            };
          }, selector) as ExtractionResult)
        : (await page.evaluate(() => {
            const data: StructuredExtractionResult = {};

            const jsonLdScripts = document.querySelectorAll(
              'script[type="application/ld+json"]'
            );

            if (jsonLdScripts.length > 0) {
              data.jsonLd = Array.from(jsonLdScripts).map((script) =>
                parseJsonLd(script.textContent)
              );
            }

            const openGraph: Record<string, string> = {};
            document
              .querySelectorAll('meta[property^="og:"]')
              .forEach((tag) => {
                const property = tag.getAttribute("property");
                const content = tag.getAttribute("content");
                if (property && content) {
                  openGraph[property] = content;
                }
              });

            if (Object.keys(openGraph).length > 0) {
              data.openGraph = openGraph;
            }

            return data;
          }) as ExtractionResult);

      return {
        success: true,
        data: extracted,
      };
    });
  }

  private async withPage<T>(handler: (page: Page) => Promise<T>): Promise<T> {
    const browser = await this.launchBrowser();
    try {
      const page = await browser.newPage();
      return await handler(page);
    } catch (error) {
      throw toError(error);
    } finally {
      await browser.close().catch(() => undefined);
    }
  }

  private async navigate(
    page: Page,
    url: string,
    waitForSelector?: string,
    timeout?: number
  ): Promise<void> {
    const resolvedTimeout = resolveTimeout(timeout);
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: resolvedTimeout,
    });

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, {
        timeout: resolvedTimeout,
      });
    }
  }

  private async launchBrowser(): Promise<Browser> {
    const puppeteer = await getPuppeteer();

    if (env.NODE_ENV === "production") {
      const launchOptions: LaunchOptions = {
        args: chromium.args,
        defaultViewport: resolveViewport(chromiumRuntime.defaultViewport),
        executablePath: await chromium.executablePath(),
        headless: resolveHeadlessMode(chromiumRuntime.headless),
      };

      return puppeteer.launch(launchOptions);
    }

    const launchOptions: LaunchOptions = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    };

    return puppeteer.launch(launchOptions);
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
