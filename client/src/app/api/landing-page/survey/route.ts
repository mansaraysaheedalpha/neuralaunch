// src/app/api/landing-page/survey/route.ts
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { handleApiError, NotFoundError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";

const surveySchema = z.object({
  signupId: z.string().cuid(),
  response1: z.string().optional(),
  response2: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const validation = surveySchema.safeParse(body);

    if (!validation.success) {
      return handleApiError(validation.error, "POST /api/landing-page/survey");
    }

    const { signupId, response1, response2 } = validation.data;

    // Check if signup exists
    const signup = await prisma.emailSignup.findUnique({
      where: { id: signupId },
      select: { id: true },
    });

    if (!signup) {
      throw new NotFoundError("Signup");
    }

    await prisma.emailSignup.update({
      where: { id: signupId },
      data: {
        surveyResponse1: response1,
        surveyResponse2: response2,
      },
    });

    return successResponse({ message: "Survey responses saved" }, "Survey responses saved successfully");
  } catch (error) {
    return handleApiError(error, "POST /api/landing-page/survey");
  }
}
