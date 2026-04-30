// src/app/sitemap.ts
//
// Public sitemap for Google + Bing. Listed URLs help search engines
// discover and index every public marketing surface; pages behind auth
// (the discovery app, settings, profile, admin) intentionally do NOT
// appear here. Dynamic story pages are fetched at request time so a
// new public story is indexable as soon as it's published — no rebuild
// required.

import { MetadataRoute } from "next";
import { env } from "@/lib/env";
import prisma from "@/lib/prisma";

const STATIC_ROUTES: ReadonlyArray<{
  path:           string;
  changeFrequency: "yearly" | "monthly" | "weekly";
  priority:       number;
}> = [
  { path: "/",                changeFrequency: "weekly",  priority: 1.0 },
  { path: "/about",           changeFrequency: "monthly", priority: 0.7 },
  { path: "/faq",             changeFrequency: "monthly", priority: 0.6 },
  { path: "/stories",         changeFrequency: "weekly",  priority: 0.7 },
  { path: "/legal/privacy",   changeFrequency: "yearly",  priority: 0.3 },
  { path: "/legal/terms",     changeFrequency: "yearly",  priority: 0.3 },
  { path: "/legal/cookies",   changeFrequency: "yearly",  priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = env.NEXT_PUBLIC_APP_URL ?? "https://startupvalidator.app";

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map(r => ({
    url:             `${baseUrl}${r.path}`,
    lastModified:    new Date(),
    changeFrequency: r.changeFrequency,
    priority:        r.priority,
  }));

  // Public-archive transformation reports. Each story is its own
  // indexable URL once publishState='public'. We surface the most
  // recent N to keep the sitemap response cheap; if/when this grows
  // beyond the 50k-URL sitemap limit, we'll split into multiple
  // sitemap files via a sitemap index.
  let storyEntries: MetadataRoute.Sitemap = [];
  try {
    const stories = await prisma.transformationReport.findMany({
      where:   { publishState: "public", publicSlug: { not: null } },
      orderBy: { publishedAt: "desc" },
      take:    200,
      select:  { publicSlug: true, publishedAt: true },
    });
    storyEntries = stories
      .filter((s): s is { publicSlug: string; publishedAt: Date | null } =>
        typeof s.publicSlug === "string" && s.publicSlug.length > 0,
      )
      .map(s => ({
        url:             `${baseUrl}/stories/${s.publicSlug}`,
        lastModified:    s.publishedAt ?? new Date(),
        changeFrequency: "monthly" as const,
        priority:        0.5,
      }));
  } catch {
    // DB unreachable at build time (preview deploy without prod DB,
    // local CLI run). Fall back to static-only sitemap rather than
    // failing the entire build over an indexing nicety.
    storyEntries = [];
  }

  return [...staticEntries, ...storyEntries];
}
