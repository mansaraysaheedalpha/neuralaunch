// scripts/debug-conversations.ts
// Check what conversations exist and why UI shows fewer
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function debugConversations() {
  console.log("🔍 DEBUGGING CONVERSATIONS\n");
  console.log("=".repeat(60));

  // Get ALL conversations
  const allConversations = await prisma.conversation.findMany({
    include: {
      messages: true,
      tags: true, // THE FIX IS HERE
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(
    `\n📊 Total conversations in database: ${allConversations.length}\n`
  );

  // Analyze each conversation
  for (let i = 0; i < allConversations.length; i++) {
    const conv = allConversations[i];
    console.log(`\n[${i + 1}] Conversation ID: ${conv.id}`);
    console.log(`   User ID: ${conv.userId || "NULL"}`);
    console.log(`   Title: "${conv.title}"`);
    console.log(`   Created: ${conv.createdAt.toISOString()}`);
    console.log(`   Updated: ${conv.updatedAt.toISOString()}`);
    console.log(`   Messages: ${conv.messages.length}`);
    console.log(
      `   Tags: ${conv.tags.length} (${
        // THE FIX IS HERE
        conv.tags.map((t) => t.tagName).join(", ") || "none" // THE FIX IS HERE
      })`
    );

    if (conv.messages.length > 0) {
      const firstMsg = conv.messages[0];
      const preview = firstMsg.content.substring(0, 100);
      console.log(`   First message: "${preview}..."`);
    } else {
      console.log(`   ⚠️  WARNING: No messages in this conversation!`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📋 SUMMARY BY USER:\n");

  const byUser = allConversations.reduce((acc, conv) => {
    const userId = conv.userId || "anonymous";
    acc[userId] = (acc[userId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  for (const [userId, count] of Object.entries(byUser)) {
    console.log(`   User ${userId}: ${count} conversations`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("🏷️  TAG STATISTICS:\n");

  const allTags = await prisma.ideaTag.findMany({ select: { tagName: true } });
  const tagCounts = allTags.reduce((acc, tag) => {
    acc[tag.tagName] = (acc[tag.tagName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sortedTags = Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  console.log("   Top 10 tags:");
  sortedTags.forEach(([tag, count]) => {
    console.log(`   - ${tag}: ${count}`);
  });

  console.log("\n" + "=".repeat(60));
  console.log("💡 RECOMMENDATIONS:\n");

  const orphaned = allConversations.filter((c) => c.messages.length === 0);
  if (orphaned.length > 0) {
    console.log(
      `   ⚠️  Found ${orphaned.length} conversations with NO messages`
    );
  }

  const noTags = allConversations.filter((c) => c.tags.length === 0); // THE FIX IS HERE
  if (noTags.length > 0) {
    console.log(`   ⚠️  Found ${noTags.length} conversations with NO tags`);
  }

  if (Object.keys(byUser).length > 1) {
    console.log(
      `   ℹ️  You have conversations from ${
        Object.keys(byUser).length
      } different users/sessions`
    );
    console.log(
      `       This is likely why your UI shows fewer conversations (it filters by the currently logged-in user).`
    );
  }

  console.log("\n✅ Debug complete!\n");
}

debugConversations()
  .then(() => {
    prisma.$disconnect();
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error:", error);
    prisma.$disconnect();
    process.exit(1);
  });
