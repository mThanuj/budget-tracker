import { ImageResponse } from "next/og";
import { BrandIcon } from "@/components/app/brand-icon";

// The installed app's icons (src/app/manifest.ts): /icon/192 and /icon/512.
export function generateImageMetadata() {
  return [192, 512].map((px) => ({ id: String(px), size: { width: px, height: px }, contentType: "image/png" }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const px = Number(await id);
  return new ImageResponse(<BrandIcon size={px} />, { width: px, height: px });
}
