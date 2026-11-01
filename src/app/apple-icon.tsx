import { ImageResponse } from "next/og";
import { BrandIcon } from "@/components/app/brand-icon";

// The icon iPhones use for "Add to Home Screen".
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<BrandIcon size={size.width} />, size);
}
