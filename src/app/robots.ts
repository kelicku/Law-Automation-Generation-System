import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/sites/"], disallow: ["/app", "/api", "/login", "/preview-frame", "/demo-sources"] }],
  };
}
