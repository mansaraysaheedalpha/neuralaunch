// src/app/api/sprint/export/[conversationId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/route";
import prisma from "@/lib/prisma";
import puppeteer from "puppeteer"; // Use the full puppeteer

// Helper function to sanitize text content for HTML
function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// NEW: A much more professional HTML and CSS generator
function generateReportHtml(conversation: any): string {
  const styles = `
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 50px;
            color: #374151;
            font-size: 14px;
            line-height: 1.6;
        }
        @page {
            size: A4;
            margin: 1in;
        }
        h1 {
            font-size: 32px;
            color: #111827;
            border-bottom: 3px solid #7C3AED;
            padding-bottom: 12px;
            margin-bottom: 12px;
            font-weight: 700;
        }
        h2 {
            font-size: 24px;
            color: #7C3AED;
            margin-top: 40px;
            margin-bottom: 10px;
            font-weight: 600;
        }
        p {
            margin-bottom: 16px;
        }
        pre {
            background-color: #f3f4f6;
            padding: 16px;
            border-radius: 8px;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-size: 13px;
            color: #1f2937;
            border: 1px solid #e5e7eb;
        }
        hr {
            border: none;
            border-top: 1px solid #e5e7eb;
            margin: 50px 0;
        }
    `;

  let tasksHtml = "";
  for (const task of conversation.tasks) {
    if (task.outputs.length > 0) {
      tasksHtml += `<hr /><h2>✅ Task: ${escapeHtml(task.title)}</h2><p>${escapeHtml(task.description)}</p>`;
      task.outputs.forEach((output: any, index: number) => {
        // Sanitize the content before injecting it into the HTML
        const safeContent = escapeHtml(output.content as string);
        tasksHtml += `
                    <div class="output-block">
                        ${task.outputs.length > 1 ? `<h3>Version ${index + 1}</h3>` : ""}
                        <pre>${safeContent}</pre>
                    </div>`;
      });
    }
  }

  return `
        <html>
            <head>
                <title>Sprint Report: ${escapeHtml(conversation.title)}</title>
                <style>${styles}</style>
            </head>
            <body>
                <h1>🚀 IdeaSpark Sprint Report: ${escapeHtml(conversation.title)}</h1>
                <p>This document contains all AI-generated assets from your 72-hour validation sprint.</p>
                ${tasksHtml}
            </body>
        </html>
    `;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> } // FIX: Await params
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return new NextResponse("Unauthorized", { status: 401 });

    const { conversationId } = await params; // FIX: Await params here

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId, userId: session.user.id },
      include: {
        tasks: {
          orderBy: { orderIndex: "asc" },
          include: { outputs: { orderBy: { createdAt: "asc" } } },
        },
      },
    });

    if (!conversation)
      return new NextResponse("Sprint not found", { status: 404 });

    const html = generateReportHtml(conversation);

    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "1in", right: "1in", bottom: "1in", left: "1in" },
    });
    await browser.close();

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="ideaspark-report-${conversationId}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[SPRINT_EXPORT_PDF_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
