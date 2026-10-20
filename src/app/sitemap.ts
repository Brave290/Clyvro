import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Public routes. Set NEXT_PUBLIC_SITE_URL in production for absolute URLs. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${siteUrl}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/scan`, lastModified, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/how-it-works`, lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/pricing`, lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
