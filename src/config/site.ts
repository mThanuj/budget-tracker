// The site's public address: BETTER_AUTH_URL, the address Google sends people
// back to. Used for link previews and the sitemap (D-036). Call it while
// handling a request, never at build time (the build has no settings). Never
// throws: without a valid address, those links stay relative or are left out.
export function siteUrl(env: Record<string, string | undefined> = process.env): URL | undefined {
  const value = env.BETTER_AUTH_URL?.trim();
  if (!value || !URL.canParse(value)) return undefined;
  const url = new URL(value);
  return url.protocol === "https:" || url.protocol === "http:" ? new URL(url.origin) : undefined;
}
