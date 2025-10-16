import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function deleteAllConversations() {
  console.log("🗑️  DELETING ALL CONVERSATIONS...\n");
  const deletedTags = await prisma.ideaTag.deleteMany({});
  console.log(`✅ Deleted ${deletedTags.count} tags`);
  const deletedMessages = await prisma.message.deleteMany({});
  console.log(`✅ Deleted ${deletedMessages.count} messages`);
  const deletedConvs = await prisma.conversation.deleteMany({});
  console.log(`✅ Deleted ${deletedConvs.count} conversations`);
  console.log("\n🎉 All conversations deleted!");
}

async function deleteOrphanedConversations() {
  console.log("🗑️  DELETING ORPHANED CONVERSATIONS...\n");
  const allConvs = await prisma.conversation.findMany({
    include: { messages: true },
  });
  const orphaned = allConvs.filter((c) => c.messages.length === 0);
  if (orphaned.length === 0) {
    console.log("✅ No orphaned conversations to delete!");
    return;
  }
  for (const conv of orphaned) {
    await prisma.ideaTag.deleteMany({ where: { conversationId: conv.id } });
    await prisma.conversation.delete({ where: { id: conv.id } });
  }
  console.log(`\n✅ Deleted ${orphaned.length} orphaned conversations!`);
}

async function deleteUntaggedConversations() {
  console.log("🗑️  DELETING UNTAGGED CONVERSATIONS...\n");
  const allConvs = await prisma.conversation.findMany({
    include: { tags: true, messages: true },
  });
  const untagged = allConvs.filter((c) => c.tags.length === 0);
  if (untagged.length === 0) {
    console.log("✅ No untagged conversations to delete!");
    return;
  }
  for (const conv of untagged) {
    await prisma.message.deleteMany({ where: { conversationId: conv.id } });
    await prisma.conversation.delete({ where: { id: conv.id } });
  }
  console.log(`\n✅ Deleted ${untagged.length} untagged conversations!`);
}

async function deleteSpecificConversation(conversationId: string) {
  console.log(`🗑️  DELETING CONVERSATION ${conversationId}...\n`);
  await prisma.ideaTag.deleteMany({ where: { conversationId } });
  await prisma.message.deleteMany({ where: { conversationId } });
  await prisma.conversation.delete({ where: { id: conversationId } });
  console.log(`✅ Deleted conversation`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  console.log(
    "=".repeat(60) +
      "\n🧹 CONVERSATION CLEANUP SCRIPT\n" +
      "=".repeat(60) +
      "\n"
  );
  const convCount = await prisma.conversation.count();
  const msgCount = await prisma.message.count();
  const tagCount = await prisma.ideaTag.count();
  console.log(
    `📊 Current state:\n   Conversations: ${convCount}\n   Messages: ${msgCount}\n   Tags: ${tagCount}\n` +
      "=".repeat(60) +
      "\n"
  );

  if (!command) {
    console.log(
      "❌ No command specified!\nUsage:\n   npm run cleanup all\n   npm run cleanup orphaned\n   npm run cleanup untagged\n   npm run cleanup <conversation-id>\n"
    );
    return;
  }

  switch (command) {
    case "all":
      await deleteAllConversations();
      break;
    case "orphaned":
      await deleteOrphanedConversations();
      break;
    case "untagged":
      await deleteUntaggedConversations();
      break;
    default:
      await deleteSpecificConversation(command);
      break;
  }

  const newConvCount = await prisma.conversation.count();
  const newMsgCount = await prisma.message.count();
  const newTagCount = await prisma.ideaTag.count();
  console.log(
    "\n" +
      "=".repeat(60) +
      `\n📊 New state:\n   Conversations: ${newConvCount} (${
        convCount - newConvCount
      } deleted)\n   Messages: ${newMsgCount} (${
        msgCount - newMsgCount
      } deleted)\n   Tags: ${newTagCount} (${
        tagCount - newTagCount
      } deleted)\n` +
      "=".repeat(60) +
      "\n"
  );
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
