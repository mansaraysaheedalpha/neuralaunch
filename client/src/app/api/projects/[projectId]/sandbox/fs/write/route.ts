// src/app/api/projects/[projectId]/sandbox/fs/write/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth"; // YOUR AUTH FILE
import prisma from "@/lib/prisma"; // YOUR PRISMA FILE
import { SandboxService } from "@/lib/services/sandbox-service"; // OUR NEW SERVICE
import { z } from "zod";

const pathSchema = z
  .string()
  .trim()
  .min(1)
  .refine((p) => !p.startsWith("/"), { message: "Path must be relative." })
  .refine((p) => !p.includes(".."), { message: "Path cannot contain '..'." });

const writeRequestSchema = z.object({
  path: pathSchema,
  content: z.string(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const params = await context.params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const project = await prisma.landingPage.findFirst({
      where: { id: params.projectId, userId: session.user.id },
    });
    if (!project) {
      return NextResponse.json(
        { error: "Forbidden or Not Found" },
        { status: 403 }
      );
    }

    const body: unknown = await req.json();
    const validation = writeRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: validation.error.format() },
        { status: 400 }
      );
    }
    const { path, content } = validation.data;

    const result = await SandboxService.writeFile(
      params.projectId,
      session.user.id,
      path,
      content
    );

    if (result.status === "error") {
      return NextResponse.json(result, { status: 500 });
    }
    return NextResponse.json(result, { status: 201 }); // 201 Created
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[SANDBOX_WRITE_API_ERROR] ${errorMessage}`, error);
    return NextResponse.json(
      { error: "Internal Server Error", message: errorMessage },
      { status: 500 }
    );
  }
}
