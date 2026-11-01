import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { billingEnabled } from "@/config/features";
import { siteUrl } from "@/config/site";

// The public pages, for search engines. The refund policy exists only while
// payments are on. A sitemap needs full addresses, so it's empty without one.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection(); // settings are read per request, not at build time
  const site = siteUrl();
  if (!site) return [];
  const paths = ["/", "/privacy", "/terms", "/contact", ...(billingEnabled() ? ["/refund"] : [])];
  return paths.map((path) => ({ url: new URL(path, site).href }));
}
