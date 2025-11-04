import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    if (typeof body !== "object" || body === null) {
      return NextResponse.json(
        { success: false, error: "Invalid request body: expected an object" },
        { status: 400 }
      );
    }
    const projectIdUnknown = (body as Record<string, unknown>).projectId;
    if (typeof projectIdUnknown !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid request body: projectId must be a string" },
        { status: 400 }
      );
    }
    const projectId = projectIdUnknown;

    await prisma.landingPage.update({
      where: { id: projectId },
      data: {
        sandboxContainerId: null,
        sandboxInternalIp: null,
        sandboxHostPort: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Sandbox records cleared",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
