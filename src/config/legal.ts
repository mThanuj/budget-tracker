// Who runs the site, shown on the legal and contact pages (Razorpay checks
// these before switching on live payments). They're public on the site but
// kept out of the repo: set them as env vars on the server and in .env.local.

export const LEGAL_UPDATED = "24 October 2026";

export function legalDetails(env: Record<string, string | undefined> = process.env) {
  const v = (key: string) => env[key]?.trim() || null;
  return {
    /** Your full legal name, or your registered business name. */
    operator: v("LEGAL_NAME"),
    email: v("SUPPORT_EMAIL"),
    phone: v("SUPPORT_PHONE"),
    /** The address you operate from. */
    address: v("BUSINESS_ADDRESS"),
    /** City whose courts handle disputes, e.g. "Hyderabad". */
    city: v("LEGAL_CITY"),
  };
}

export type LegalDetails = ReturnType<typeof legalDetails>;

/** Which of the required details are still missing (shown on the admin page). */
export function missingLegalDetails(d: LegalDetails = legalDetails()) {
  return (
    [
      ["LEGAL_NAME", d.operator],
      ["SUPPORT_EMAIL", d.email],
      ["BUSINESS_ADDRESS", d.address],
      ["LEGAL_CITY", d.city],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([key]) => key);
}
