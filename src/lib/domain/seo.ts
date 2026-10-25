import type { ArticleContent } from "./article";

export interface SeoFirm {
  name: string;
  slug: string;
  address: string;
  phone: string;
  lawyers: { name: string; title: string }[];
}

export function articleUrl(origin: string, firmSlug: string, slug: string) {
  return `${origin}/sites/${firmSlug}/${slug}`;
}

/** schema.org JSON-LD for a published article. */
export function articleJsonLd(origin: string, firm: SeoFirm, slug: string, c: ArticleContent, publishedAt: string, updatedAt: string) {
  const url = articleUrl(origin, firm.slug, slug);
  const org = {
    "@type": "LegalService",
    name: firm.name,
    url: `${origin}/sites/${firm.slug}`,
    address: firm.address,
    telephone: firm.phone,
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: c.seo.title || c.title,
        description: c.seo.description,
        datePublished: publishedAt,
        dateModified: updatedAt,
        mainEntityOfPage: url,
        url,
        inLanguage: "ja",
        keywords: c.seo.keywords.join(", "),
        author: { "@type": "Organization", name: firm.name },
        publisher: org,
        citation: c.links.map((l) => ({ "@type": "CreativeWork", name: l.label, url: l.url.startsWith("/") ? `${origin}${l.url}` : l.url })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: firm.name, item: `${origin}/sites/${firm.slug}` },
          { "@type": "ListItem", position: 2, name: c.title, item: url },
        ],
      },
    ],
  };
}

/** Serialises JSON-LD safely for embedding inside a <script> tag. */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

export function sitemapXml(origin: string, firmSlug: string, pages: { slug: string; updated_at: string }[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const urls = [
    `<url><loc>${esc(`${origin}/sites/${firmSlug}`)}</loc></url>`,
    ...pages.map((p) => `<url><loc>${esc(articleUrl(origin, firmSlug, p.slug))}</loc><lastmod>${esc(p.updated_at.slice(0, 10))}</lastmod></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
