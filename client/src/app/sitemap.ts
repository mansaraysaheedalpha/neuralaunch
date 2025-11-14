import { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  // Get your base URL from environment variables for production
  const baseUrl = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return [
    {
      url: baseUrl, // Your homepage
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 1,
    },
    {
      url: `${baseUrl}/trends`, // Your trends page
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    
    // Add more static URLs here if you have them (e.g., /about, /pricing)
    // {
    //   url: `${baseUrl}/about`,
    //   lastModified: new Date(),
    //   changeFrequency: 'monthly',
    //   priority: 0.5,
    // },

    // If you had dynamic pages (like blog posts), you would fetch their slugs
    // and generate URLs for them here. You don't seem to have many dynamic public pages yet.
  ];
}
