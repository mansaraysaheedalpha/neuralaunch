import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Task, TaskOutput, Prisma } from "@prisma/client";

// --- Revert to @sparticuz/chromium ---
import chromium from "@sparticuz/chromium";
// ------------------------------------
import puppeteer from "puppeteer-core";
import type { Browser } from "puppeteer-core";

// Keep puppeteerFull only for local dev fallback
import puppeteerFull from "puppeteer"; // Ensure this is a devDependency
import { marked } from "marked";
import { Buffer } from "node:buffer";

export const runtime = "nodejs";

// generateHTML function (Keep previous robust version)
async function generateHTML(
  title: string,
  tasks: (Task & { outputs: TaskOutput[] })[]
): Promise<string> {
  // ... (HTML generation code remains the same) ...
  const styles = `
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; padding: 40px; }
      h1, h2, h3 { color: #111; }
      h1 { font-size: 28px; border-bottom: 2px solid #eee; padding-bottom: 15px; }
      h2 { font-size: 22px; margin-top: 40px; }
      hr { border: none; border-top: 1px solid #eee; margin: 40px 0; }
      .task-card { page-break-inside: avoid; }
      .output-content { background-color: #f6f8fa; padding: 16px; border-radius: 6px; border: 1px solid #e1e4e8; margin-top: 20px; overflow-wrap: break-word; white-space: pre-wrap; }
      table { width: 100%; border-collapse: collapse; margin-top: 1em; margin-bottom: 1em; table-layout: fixed; }
      th, td { border: 1px solid #ddd; padding: 10px; text-align: left; vertical-align: top; word-wrap: break-word; }
      th { background-color: #f2f2f2; font-weight: 600; }
      tr:nth-child(even) { background-color: #f9f9f9; }
      pre { background-color: #eee; padding: 10px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; }
      code { font-family: monospace; }
    `;

  const tasksWithParsedContent = await Promise.all(
    tasks
      .filter((task) => task.outputs.length > 0 && task.outputs[0]?.content)
      .map(async (task) => {
        const content = task.outputs[0]?.content as
          | Prisma.JsonValue
          | undefined;
        let contentStr: string;

        if (typeof content === "string") {
          contentStr = content;
        } else if (
          content !== null &&
          content !== undefined &&
          typeof content === "object"
        ) {
          contentStr = "```json\n" + JSON.stringify(content, null, 2) + "\n```";
        } else {
          contentStr = "";
        }

        let parsedContent = "";
        if (contentStr) {
          try {
            parsedContent = await marked.parse(contentStr);
          } catch (parseError) {
            console.error("Markdown parsing error:", parseError);
            parsedContent = `<pre><code>${contentStr.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`;
          }
        }

        return {
          title: task.title,
          description: task.description,
          parsedContent,
        };
      })
  );

  const tasksHTML = tasksWithParsedContent
    .map(
      (task) => `
        <div class="task-card">
          <hr />
          <h2>✅ Task: ${task.title}</h2>
          <p>${task.description.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
          <div class="output-content">
            ${task.parsedContent}
          </div>
        </div>
      `
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Sprint Report: ${title}</title><style>${styles}</style></head><body><h1>🚀 IdeaSpark Sprint Report: ${title.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</h1><p>This document contains all the AI-generated assets from your 72-hour validation sprint.</p>${tasksHTML}</body></html>`;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { conversationId } = await context.params;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId, userId: session.user.id },
      include: {
        tasks: {
          orderBy: { orderIndex: "asc" },
          include: { outputs: true },
        },
      },
    });

    if (!conversation) {
      return new NextResponse("Conversation not found", { status: 404 });
    }

    let browser: Browser | null = null;
    let pdfBuffer: Buffer | null = null;

    try {
      console.log("🚀 Launching browser...");
      const isProduction = process.env.VERCEL_ENV === "production";
      let executablePath: string | undefined = undefined;

      if (!isProduction) {
        console.log(
          "Running in development/preview mode, attempting full puppeteer."
        );
        try {
          browser = await puppeteerFull.launch({ headless: true });
        } catch (devError) {
          console.warn(
            "Full puppeteer launch failed locally, falling back.",
            devError instanceof Error ? devError.message : devError
          );
          try {
            const localChromePath =
              process.platform === "win32"
                ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
                : process.platform === "linux"
                  ? "/usr/bin/google-chrome"
                  : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
            browser = await puppeteer.launch({
              executablePath: localChromePath,
              args: [],
              headless: true,
            });
          } catch (fallbackError) {
            console.error(
              "Could not launch local Chrome instance either.",
              fallbackError
            );
            throw new Error(
              "Failed to launch browser instance for local development."
            );
          }
        }
      } else {
        console.log("Running in production mode, using @sparticuz/chromium.");
        // --- Revert to @sparticuz/chromium logic ---
        executablePath = await chromium.executablePath(); // Use await directly if function returns promise
        if (!executablePath) {
          throw new Error(
            "Could not find Chromium executable path via @sparticuz/chromium."
          );
        }
        console.log(`Using Chromium path: ${executablePath}`);
        browser = await puppeteer.launch({
          args: chromium.args,
          executablePath: executablePath,
          headless: true, // Use boolean true for headless
        });
        console.log("Browser launched successfully on Vercel.");
        // ---------------------------------------------
      }

      if (!browser) {
        throw new Error("Browser instance could not be launched.");
      }

      const page = await browser.newPage();
      console.log("Browser page opened.");

      const htmlContent = await generateHTML(
        conversation.title,
        conversation.tasks
      );
      console.log("HTML content generated.");

      await page.setContent(htmlContent, {
        waitUntil: "networkidle0",
        timeout: 15000,
      });
      console.log("HTML content set on page.");

      // Convert the Uint8Array returned by page.pdf to a Node Buffer to satisfy the expected Buffer type.
      pdfBuffer = Buffer.from(
        await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "20px", right: "20px", bottom: "20px", left: "20px" },
          timeout: 15000,
        })
      );
      console.log("✅ PDF generated successfully.");
    } catch (renderError) {
      console.error("❌ Error during PDF rendering phase:", renderError);
      throw renderError;
    } finally {
      if (browser) {
        await browser.close();
        console.log("🔒 Browser closed.");
      }
    }

    if (!pdfBuffer) {
      throw new Error("PDF Buffer could not be generated.");
    }

    // Convert Node Buffer to a proper ArrayBuffer slice to satisfy BlobPart typing
    const pdfArray = new Uint8Array(pdfBuffer);
    const arrayBuffer = pdfArray.buffer.slice(
      pdfArray.byteOffset,
      pdfArray.byteOffset + pdfArray.byteLength
    );
    const pdfBlob = new Blob([arrayBuffer], { type: "application/pdf" });

    const safeFilename = conversation.title
      .replace(/[^a-z0-9_\-\s]/gi, "_")
      .replace(/\s+/g, "_")
      .toLowerCase();

    return new NextResponse(pdfBlob, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename}-sprint-report.pdf"`,
      },
    });
  } catch (error) {
    console.error("❌ [PDF_EXPORT_ERROR - Overall]", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown error occurred during PDF export.";
    return new NextResponse(errorMessage, { status: 500 });
  }
}
