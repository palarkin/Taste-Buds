import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Taste Buds",
    short_name: "Taste Buds",
    description: "Track the root beers you've tried and find the ones you haven't.",
    start_url: "/log",
    display: "standalone",
    background_color: "#fdf8f1",
    theme_color: "#6b3a1f",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
