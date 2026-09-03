/**
 * Site metadata, in one place so the title, description, and social card
 * cannot disagree between the document head and anywhere else that needs
 * them.
 */
export const SITE = {
  name: "proxycroc",
  url: "https://proxycroc.4kshat.dev",
  title: "proxycroc: a proxy bot for agents",
  description:
    "Give an agent a scoped API key and it can read your GitHub issues and pull requests, comment, open and close issues, and review code, without ever holding your credentials.",
  image: "/og.png",
  imageAlt: "The proxycroc crocodile beside the proxycroc wordmark",
  locale: "en_US",
} as const;

/**
 * Head tags for one page. `path` and the page title vary; everything else is
 * the site's.
 */
export function meta(page?: { title?: string; description?: string; path?: string }) {
  const title = page?.title ? `${page.title} · ${SITE.name}` : SITE.title;
  const description = page?.description ?? SITE.description;
  const url = `${SITE.url}${page?.path ?? "/"}`;
  const image = `${SITE.url}${SITE.image}`;

  return [
    { title },
    { name: "description", content: description },
    { name: "application-name", content: SITE.name },
    { name: "theme-color", content: "#f4ecdc" },

    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE.name },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:locale", content: SITE.locale },
    { property: "og:image", content: image },
    { property: "og:image:secure_url", content: image },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: SITE.imageAlt },

    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: SITE.imageAlt },
  ];
}
