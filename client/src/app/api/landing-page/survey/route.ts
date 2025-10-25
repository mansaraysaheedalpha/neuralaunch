// src/app/api/landing-page/survey/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";

const surveySchema = z.object({
  signupId: z.string().cuid(), // ID returned from initial signup
  response1: z.string().optional(),
  response2: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const validation = surveySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { signupId, response1, response2 } = validation.data;

    // Check if signup exists (optional security check)
    const signup = await prisma.emailSignup.findUnique({
      where: { id: signupId },
      select: { id: true },
    });

    if (!signup) {
      return NextResponse.json({ error: "Signup not found" }, { status: 404 });
    }

    await prisma.emailSignup.update({
      where: { id: signupId },
      data: {
        surveyResponse1: response1,
        surveyResponse2: response2,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[LP_SURVEY_ERROR]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
