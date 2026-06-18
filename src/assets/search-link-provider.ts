// Emits ready-to-click search URLs per query so the user never has to think up
// where to look. Active provider — no network access, pure URL construction.

import {
  getSectionDefinition,
  type LinkProvider,
  type SearchLink,
  type SearchQuery
} from "./asset-source-provider.js";
import type { SectionQueries } from "./search-query-generator.js";

export class SearchLinkProvider implements LinkProvider {
  readonly id = "search-link";
  readonly kind = "search-link" as const;

  isAvailable(): boolean {
    return true;
  }

  buildLinks(queries: SearchQuery[]): SearchLink[] {
    return queries.map((query) => ({
      section: query.section,
      query: query.query,
      links: [
        { label: "Pinterest", url: pinterestUrl(query.query) },
        { label: "Google Images", url: googleImagesUrl(query.query) },
        { label: "Pexels", url: pexelsUrl(query.query) },
        { label: "Unsplash", url: unsplashUrl(query.query) }
      ]
    }));
  }
}

function pinterestUrl(query: string): string {
  return `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;
}

function googleImagesUrl(query: string): string {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
}

function pexelsUrl(query: string): string {
  return `https://www.pexels.com/search/${encodeURIComponent(query)}/`;
}

function unsplashUrl(query: string): string {
  return `https://unsplash.com/s/photos/${encodeURIComponent(query)}`;
}

export function renderSearchLinksMarkdown(sections: SectionQueries[]): string {
  const provider = new SearchLinkProvider();
  const lines: string[] = [
    "# Asset Search Links",
    "",
    "Curated search URLs per section. Open these, save matching images/videos into",
    "the matching `Desktop/new-fashion-assets/<section>/` folder, then run",
    "`npm run assets:audit`.",
    "",
    "Audience for every query: women 35-55, summer, premium / quiet-luxury look.",
    ""
  ];

  for (const section of sections) {
    const definition = getSectionDefinition(section.section);
    lines.push(
      `## ${section.displayTitle}`,
      "",
      `- Target folder: \`Desktop/new-fashion-assets/${definition.importFolder ?? "(derived)"}/\``,
      `- Minimum assets: ${section.minimum}`,
      ""
    );

    const links = provider.buildLinks(section.queries);
    for (const link of links) {
      lines.push(`### "${link.query}"`);
      lines.push(link.links.map((entry) => `[${entry.label}](${entry.url})`).join(" · "));
      lines.push("");
    }
  }

  return lines.join("\n") + "\n";
}
