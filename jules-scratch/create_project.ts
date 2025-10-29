// jules-scratch/create_project.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const user = await prisma.user.create({
    data: {
      email: `testuser-${Date.now()}@example.com`,
      name: 'Test User',
    },
  })

  const conversation = await prisma.conversation.create({
    data: {
      title: 'Test Conversation',
      userId: user.id,
    },
  })

  const landingPage = await prisma.landingPage.create({
    data: {
      title: 'Test Project',
      slug: `test-project-${Date.now()}`,
      headline: 'Test Headline',
      subheadline: 'Test Subheadline',
      features: [],
      designVariant: 'default',
      colorScheme: {},
      userId: user.id,
      conversationId: conversation.id,
    },
  })

  console.log(landingPage.id)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
