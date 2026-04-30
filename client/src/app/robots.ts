// src/app/robots.ts
//
// Tells crawlers which paths are public and where to find the sitemap.
// Auth-gated and operational endpoints (the discovery app shell,
// settings, admin moderation, every API route, validation landing
// pages, and the recovery flow) are explicitly disallowed — they
// either require a session, contain founder-private data, or are
// not meaningful to a search engine. Public marketing surfaces
// (homepage, /about, /faq, /stories, /legal/*) are crawlable by
// virtue of NOT appearing in disallow + appearing in sitemap.ts.

import { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = env.NEXT_PUBLIC_APP_URL ?? "https://startupvalidator.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow:     "/",
        disallow: [
          "/api/",
          "/discovery",
          "/discovery/",
          "/settings",
          "/profile",
          "/tools",
          "/admin",
          "/admin/",
          "/auth/",
          "/signin",
          "/chat/",
          "/lp/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host:    baseUrl,
  };
}
