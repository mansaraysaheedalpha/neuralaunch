// src/app/api/landing-page/generate/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  generateLandingPageContent,
  generateSlug,
  DESIGN_VARIANTS,
  LandingPageContent,
} from "lib/landing-page-generator";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { saveMemory } from "@/lib/ai-memory";

const generateRequestSchema = z.object({
  conversationId: z.string().cuid({ message: "Invalid Conversation ID" }),
  designVariantId: z.string().optional(),
});

type ConversationWithDetails = Prisma.ConversationGetPayload<{
  include: {
    messages: {
      where: { role: "model" };
      orderBy: { createdAt: "asc" };
      take: 1;
    };
    tags: { include: { tag: { select: { name: true } } } };
  };
}>;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const userId = session.user.id;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const body = await req.json();

    const validation = generateRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: validation.error.format() },
        { status: 400 }
      );
    }
    const { conversationId, designVariantId } = validation.data;

    const conversation: ConversationWithDetails | null =
      await prisma.conversation.findUnique({
        where: { id: conversationId, userId: userId },
        include: {
          messages: {
            where: { role: "model" },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
          tags: { include: { tag: { select: { name: true } } } },
        },
      });

    // --- FIX: Add explicit null check for conversation ---
    if (!conversation) {
      return new NextResponse("Conversation not found", { status: 404 });
    }
    // ---------------------------------------------------

    const blueprintMessage = conversation.messages?.[0];
    if (!blueprintMessage?.content) {
      return new NextResponse("Blueprint message not found", { status: 404 });
    }
    const blueprint = blueprintMessage.content;

    const targetMarket = conversation.tags.some(
      (t) => t.tag.name.toLowerCase() === "b2c"
    )
      ? "b2c"
      : "b2b";

    const content: LandingPageContent = await generateLandingPageContent(
      blueprint,
      conversation.title,
      targetMarket
    );

    const designVariant =
      DESIGN_VARIANTS.find((v) => v.id === designVariantId) ??
      DESIGN_VARIANTS[0];

    // --- FIX: Use safer casting for JSON fields ---
    const featuresJson = (content.features ?? {}) as Prisma.InputJsonValue;
    const colorSchemeJson = (designVariant.colorScheme ??
      {}) as Prisma.InputJsonValue;
    // ---------------------------------------------

    const cleanBaseSlug = generateSlug(content.headline);

    const landingPage = await prisma.landingPage.upsert({
      where: { conversationId: conversationId },
      update: {
        headline: content.headline,
        subheadline: content.subheadline,
        problemStatement: content.problemStatement,
        solutionStatement: content.solutionStatement,
        features: featuresJson, // Use the casted value
        ctaText: content.ctaText,
        metaTitle: content.metaTitle,
        metaDescription: content.metaDescription,
        designVariant: designVariant.id,
        colorScheme: colorSchemeJson, // Use the casted value
        slug: cleanBaseSlug,
      },
      create: {
        userId: userId,
        conversationId,
        slug: cleanBaseSlug,
        title: conversation.title,
        headline: content.headline,
        subheadline: content.subheadline,
        problemStatement: content.problemStatement,
        solutionStatement: content.solutionStatement,
        features: featuresJson, // Use the casted value
        ctaText: content.ctaText,
        metaTitle: content.metaTitle,
        metaDescription: content.metaDescription,
        designVariant: designVariant.id,
        colorScheme: colorSchemeJson, // Use the casted value
      },
      select: { id: true },
    });

    // --- 👇 2. SAVE LANDING PAGE CONTENT AS MEMORY ---
    // Format a concise summary of the generated content
    const memoryContent = `Generated Landing Page Content:
Headline: ${content.headline}
Subheadline: ${content.subheadline}
Problem: ${content.problemStatement ?? "N/A"}
Solution: ${content.solutionStatement ?? "N/A"}
CTA: ${content.ctaText}`;

    // Run without 'await' so it doesn't block the response
    void saveMemory({
      content: memoryContent,
      conversationId: conversationId,
      userId: userId,
    });

    return NextResponse.json({ success: true, landingPage });
  } catch (error: unknown) {
    // Type the catch parameter
    console.error("[LP_GENERATE_ERROR]", error);
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
