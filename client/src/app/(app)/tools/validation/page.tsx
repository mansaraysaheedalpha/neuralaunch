// src/app/(app)/tools/validation/page.tsx
//
// Standalone Validation Page tool. Server component that loads the
// user's recent recommendations for the optional "tie this to a
// recommendation" picker, then hands off to a client component for
// the target textarea + generate flow.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { ToolShell } from "@/components/institute/tools";
import {
  StandaloneValidationClient,
  type RecommendationOption,
} from "./StandaloneValidationClient";

export default async function StandaloneValidationPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const tier = session.user.tier ?? "free";
  // Free users see the tier gate on the /tools hub; this page is
  // defensively redirected too in case they deep-link in.
  if (tier !== "execute" && tier !== "compound") redirect("/tools");

  const userId = session.user.id;

  const recommendations = await prisma.recommendation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      path: true,
      createdAt: true,
    },
  });

  const options: RecommendationOption[] = recommendations.map((r) => ({
    id: r.id,
    label: r.path,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <ToolShell
      model="Public"
      toolName="Validation Page"
      roman="V"
      description="A live landing page · real demand signal"
      heading={
        <>
          Validate <em>before you build.</em>
        </>
      }
      lede={
        <>
          Publish a live landing page for a specific offer — share the URL with
          prospects, then measure their interest from real behaviour: page
          views, scroll depth, feature-interest clicks, and CTA conversion.
        </>
      }
      flush
    >
      <StandaloneValidationClient recommendations={options} />
    </ToolShell>
  );
}
