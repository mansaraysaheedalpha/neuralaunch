import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import { 
  generateLandingPageContent,
  generateUniqueSlug,
  generateSlug, // Import the simpler slug generator
  DESIGN_VARIANTS,
 } from "lib/landing-page-generator";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id)
      return new NextResponse("Unauthorized", { status: 401 });

    const body = await req.json();
    const { conversationId, designVariantId } = body;
    if (!conversationId)
      return new NextResponse("Missing conversationId", { status: 400 });

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId, userId: session.user.id },
      include: {
        messages: { where: { role: "model" }, take: 1 },
        tags: true,
      },
    });

    if (!conversation?.messages?.[0])
      return new NextResponse("Blueprint not found", { status: 404 });

    const blueprint = conversation.messages[0].content;
    const targetMarket = conversation.tags.some(
      (t) => t.tagName.toLowerCase() === "b2c"
    )
      ? "b2c"
      : "b2b";

    const content = await generateLandingPageContent(
      blueprint,
      conversation.title,
      targetMarket
    );

    const designVariant =
      DESIGN_VARIANTS.find((v) => v.id === designVariantId) ||
      DESIGN_VARIANTS[0];

    const landingPage = await prisma.landingPage.upsert({
      where: { conversationId: conversationId },
      update: {
        headline: content.headline,
        subheadline: content.subheadline,
        problemStatement: content.problemStatement,
        solutionStatement: content.solutionStatement,
        features: content.features,
        ctaText: content.ctaText,
        metaTitle: content.metaTitle,
        metaDescription: content.metaDescription,
        designVariant: designVariant.id,
        colorScheme: designVariant.colorScheme,
        // THIS IS THE FIX: Also update the slug on regeneration
        slug: generateSlug(content.headline),
      },
      create: {
        userId: session.user.id,
        conversationId,
        slug: await generateUniqueSlug(content.headline, prisma),
        title: conversation.title,
        ...content,
        designVariant: designVariant.id,
        colorScheme: designVariant.colorScheme,
      },
    });

    return NextResponse.json({ success: true, landingPage });
  } catch (error) {
    console.error("[LP_GENERATE_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
