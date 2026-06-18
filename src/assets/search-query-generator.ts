// Turns the script's canonical sections into per-section search queries.
//
// MVP behaviour: each section's curated seed queries are the base. When a
// transcript is supplied we additionally surface a few section-relevant nouns
// found in the spoken text so the query set tracks the actual script wording.
// The seeds are always kept (they encode the audience: summer, premium, 35-55).

import {
  COLLECTABLE_SECTIONS,
  inferLocale,
  type SearchQuery,
  type SectionId
} from "./asset-source-provider.js";

export interface SectionQueries {
  section: SectionId;
  displayTitle: string;
  minimum: number;
  queries: SearchQuery[];
}

export interface SearchQueriesDocument {
  generatedAt: string;
  audience: string;
  sections: {
    section: SectionId;
    displayTitle: string;
    minimum: number;
    queries: { query: string; locale: "de" | "en" }[];
  }[];
}

// Words in the transcript that hint a query belongs to a section. Used only to
// optionally enrich the curated seeds, never to replace them.
const SECTION_TRANSCRIPT_HINTS: Record<SectionId, string[]> = {
  intro: ["sommer", "elegant", "hochwertig"],
  blusen: ["bluse", "blusen", "hemdbluse", "hemdblusen"],
  weisse_hosen: ["hose", "hosen", "weiße hose", "stoffhose"],
  rocke: ["rock", "röcke", "midirock", "maxirock"],
  tops: ["top", "tops", "seidentop", "satin"],
  westen: ["weste", "westen", "waistcoat"],
  outro: []
};

export function generateSectionQueries(transcriptText?: string): SectionQueries[] {
  const normalizedTranscript = transcriptText?.toLowerCase() ?? "";

  return COLLECTABLE_SECTIONS.map((definition) => {
    const seeds = definition.seedQueries.map<SearchQuery>((query) => ({
      section: definition.id,
      query,
      locale: inferLocale(query)
    }));

    const enrichment = buildTranscriptEnrichment(definition.id, normalizedTranscript);
    const queries = dedupeQueries([...seeds, ...enrichment]);

    return {
      section: definition.id,
      displayTitle: definition.displayTitle,
      minimum: definition.minimum,
      queries
    };
  });
}

export function buildSearchQueriesDocument(transcriptText?: string): SearchQueriesDocument {
  return {
    generatedAt: new Date().toISOString(),
    audience: "women 35-55, summer, premium / quiet-luxury aesthetic",
    sections: generateSectionQueries(transcriptText).map((section) => ({
      section: section.section,
      displayTitle: section.displayTitle,
      minimum: section.minimum,
      queries: section.queries.map((query) => ({ query: query.query, locale: query.locale }))
    }))
  };
}

function buildTranscriptEnrichment(section: SectionId, transcript: string): SearchQuery[] {
  if (!transcript) {
    return [];
  }

  const hints = SECTION_TRANSCRIPT_HINTS[section];
  const matched = hints.some((hint) => transcript.includes(hint));

  // We do not fabricate brand-new phrasings from the transcript in the MVP; we
  // only confirm the section is referenced and add one audience-anchored variant
  // so the section's intent stays explicit in the query file.
  if (!matched) {
    return [];
  }

  return [
    {
      section,
      query: `${section.replace("_", " ")} Damen Sommer elegant 35 45 55`,
      locale: "de"
    }
  ];
}

function dedupeQueries(queries: SearchQuery[]): SearchQuery[] {
  const seen = new Set<string>();
  const result: SearchQuery[] = [];

  for (const query of queries) {
    const key = `${query.section}::${query.query.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(query);
  }

  return result;
}
