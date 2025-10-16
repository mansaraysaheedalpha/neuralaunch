import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getTagExtractionPrompt,
  cleanAndValidateTags,
  ALL_VALID_TAGS,
} from "../lib/tag-taxonomy";

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

async function cleanExistingTags() {
  console.log("🧹 Starting tag cleanup...");

  const allTags = await prisma.ideaTag.findMany({
    select: { tagName: true, id: true },
  });
  console.log(`Found ${allTags.length} existing tags to review.`);

  const badTagIds = allTags
    .filter((tag) => {
      const wordCount = tag.tagName.trim().split(/\s+/).length;
      return wordCount > 3 || tag.tagName.length > 30;
    })
    .map((tag) => tag.id);

  console.log(`Found ${badTagIds.length} obviously bad tags (long sentences).`);

  if (badTagIds.length > 0) {
    await prisma.ideaTag.deleteMany({ where: { id: { in: badTagIds } } });
    console.log(`✅ Deleted ${badTagIds.length} bad tags.`);
  }

  console.log("\n🔄 Re-extracting tags from existing conversations...");
  const conversations = await prisma.conversation.findMany({
    include: {
      messages: { where: { role: "model" }, orderBy: { createdAt: "asc" } },
    },
  });
  console.log(`Found ${conversations.length} conversations to process.`);

  for (const conversation of conversations) {
    try {
      const blueprint = conversation.messages[0]?.content;
      if (!blueprint || !blueprint.includes("The Pitch")) {
        console.log(
          `- Skipping conversation ${conversation.id}: No valid blueprint found.`
        );
        continue;
      }

      const tagPrompt = getTagExtractionPrompt(blueprint);
      const tagResult = await model.generateContent(tagPrompt);
      const tagText = await tagResult.response.text();

      const rawTags = tagText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const validatedTags = cleanAndValidateTags(rawTags);
      const fallbackTags = ALL_VALID_TAGS.filter((tag) =>
        new RegExp(`\\b${tag}\\b`, "i").test(blueprint)
      );
      const finalTags = [...new Set([...validatedTags, ...fallbackTags])].slice(
        0,
        10
      );

      if (finalTags.length > 0) {
        await prisma.ideaTag.deleteMany({
          where: { conversationId: conversation.id },
        });
        await prisma.ideaTag.createMany({
          data: finalTags.map((tagName) => ({
            conversationId: conversation.id,
            tagName,
          })),
          skipDuplicates: true,
        });
        console.log(
          `✅ Conv ${conversation.id}: Replaced with ${
            finalTags.length
          } clean tags -> ${finalTags.join(", ")}`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Rate limit
    } catch (error) {
      console.error(
        `❌ Error processing conversation ${conversation.id}:`,
        (error as any).message
      );
    }
  }
  console.log("\n🎉 Tag cleanup complete!");
}

cleanExistingTags()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
