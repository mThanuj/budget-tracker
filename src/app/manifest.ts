import type { MetadataRoute } from "next";
import { APP_NAME } from "@/config/app";

// What phones and browsers need to install the app (D-031). No service worker:
// nothing is kept offline, so no user data sits on the device.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "Track your spending, set budgets and ask questions about your money in plain words.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7f4", // --background (light), src/app/globals.css
    theme_color: "#0f6e66", // --primary (light)
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
