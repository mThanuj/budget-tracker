import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { siteUrl } from "@/config/site";

// Search engines may read the public pages but not the API. Signed-in pages
// already send visitors without a session to the landing page (src/proxy.ts).
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection(); // the site's address is a setting: read it per request, not at build time
  const site = siteUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    ...(site && { sitemap: new URL("/sitemap.xml", site).href }),
  };
}
