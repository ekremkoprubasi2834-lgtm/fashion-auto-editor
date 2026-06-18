import fs from "node:fs";
import path from "node:path";
import type { AssetManifestEntry } from "./asset-manifest-builder.js";
import { loadPreparedAssetManifest } from "./prepared-asset-manifest.js";

const SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

// Section-locked asset binding.
//
// Each scene may ONLY draw from its own section's asset group. Cross-section
// usage (e.g. a skirt image in the Blusen section) is structurally impossible
// here because the candidate pool is built per section, never from a shared
// pool. Selection is deterministic (cursor rotation, no randomness), avoids
// repeating the same asset back-to-back between scenes of a section, and keeps
// the slots of a single scene distinct whenever the section pool is large
// enough.
const SECTION_PREFIXES: Record<string, string> = {
  item_1: "01-",
  item_2: "02-",
  item_3: "03-",
  item_4: "04-",
  item_5: "05-"
};

// Outro recap uses the five main pieces only, in chapter order.
const OUTRO_RECAP_FILENAMES = [
  "01-blusen-weiss-hemdbluse.jpg",
  "02-weisse-hose-gerade.jpg",
  "03-rock-schokobraun-satin.jpg",
  "04-satin-top-schokobraun.jpg",
  "05-weste-strukturiert-beige.jpg"
];

interface BindingState {
  cursorBySection: Map<string, number>;
  lastAssetBySection: Map<string, string>;
}

export interface SectionAssetPools {
  // Absolute/relative paths of the assets a section may use, in stable order.
  poolFor(section: string): string[];
  // Convenience: how many distinct assets the section can draw from.
  countFor(section: string): number;
}

// Single source of truth for "which assets belong to which section". Both the
// resolver (binding) and the timeline (layout downgrade) read from here so they
// can never disagree about a section's available asset count.
export function loadSectionAssetPools(assetsDir: string): SectionAssetPools {
  const manifest = loadPreparedAssetManifest();
  const allowLegacyScan = process.env.ALLOW_LEGACY_ASSET_SCAN === "true";
  const realAssets = !manifest.ok && allowLegacyScan && fs.existsSync(assetsDir) ? listRealAssets(assetsDir) : [];
  const cache = new Map<string, string[]>();

  const poolFor = (section: string): string[] => {
    const cached = cache.get(section);
    if (cached) {
      return cached;
    }

    const pool = manifest.ok
      ? buildManifestPool(section, manifest.manifest.assetsDir)
      : allowLegacyScan
        ? buildPool(section, realAssets, assetsDir)
        : [];
    cache.set(section, pool);
    return pool;
  };

  return {
    poolFor,
    countFor: (section: string) => poolFor(section).length
  };
}

function buildManifestPool(section: string, assetsDir: string): string[] {
  const manifest = loadPreparedAssetManifest();
  if (!manifest.ok) {
    return [];
  }

  if (section === "outro") {
    return [
      manifest.manifest.sections.blusen.files[0]?.path,
      manifest.manifest.sections.weisse_hosen.files[0]?.path,
      manifest.manifest.sections.rocke.files[0]?.path,
      manifest.manifest.sections.tops.files[0]?.path,
      manifest.manifest.sections.westen.files[0]?.path
    ].filter((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate)));
  }

  if (section === "intro") {
    return manifest.manifest.sections.intro.files.map((file) => file.path);
  }

  const sectionMap: Record<string, keyof typeof manifest.manifest.sections> = {
    item_1: "blusen",
    item_2: "weisse_hosen",
    item_3: "rocke",
    item_4: "tops",
    item_5: "westen"
  };
  const manifestSection = sectionMap[section];
  return manifestSection ? manifest.manifest.sections[manifestSection].files.map((file) => file.path) : [];
}

export function resolveManualAssets(manifest: AssetManifestEntry[], assetsDir: string): AssetManifestEntry[] {
  if (!fs.existsSync(assetsDir)) {
    return manifest.map((entry) => ({ ...entry }));
  }

  const pools = loadSectionAssetPools(assetsDir);
  const state: BindingState = {
    cursorBySection: new Map(),
    lastAssetBySection: new Map()
  };

  const scenes = groupByScene(manifest);
  const resolved = new Map<AssetManifestEntry, AssetManifestEntry>();

  for (const sceneEntries of scenes) {
    const section = sceneEntries[0].section;
    const pool = pools.poolFor(section);

    if (pool.length === 0) {
      for (const entry of sceneEntries) {
        resolved.set(entry, {
          ...entry,
          status: "missing",
          localPath: null,
          sourceUrl: null,
          notes: `BLOCKED_INSUFFICIENT_SECTION_ASSETS: no assets available for section "${section}".`
        });
      }
      continue;
    }

    const picks = pickForScene(section, pool, sceneEntries.length, state);

    sceneEntries.forEach((entry, slotIndex) => {
      resolved.set(entry, {
        ...entry,
        status: "selected",
        localPath: picks[slotIndex],
        sourceUrl: null,
        notes: `Section-locked: scene bound to "${section}" asset group (${path.basename(picks[slotIndex])}).`
      });
    });
  }

  // Preserve original manifest order.
  return manifest.map((entry) => resolved.get(entry) ?? { ...entry });
}

function pickForScene(
  section: string,
  pool: string[],
  slotCount: number,
  state: BindingState
): string[] {
  let cursor = state.cursorBySection.get(section) ?? 0;
  const last = state.lastAssetBySection.get(section);
  const picks: string[] = [];
  const usedThisScene = new Set<string>();
  const canBeDistinct = pool.length >= slotCount;

  for (let slot = 0; slot < slotCount; slot += 1) {
    let candidate = pool[cursor % pool.length];
    let attempts = 0;

    while (
      attempts < pool.length &&
      ((slot === 0 && pool.length > 1 && candidate === last) ||
        (canBeDistinct && usedThisScene.has(candidate)))
    ) {
      cursor += 1;
      candidate = pool[cursor % pool.length];
      attempts += 1;
    }

    picks.push(candidate);
    usedThisScene.add(candidate);
    cursor += 1;
  }

  state.cursorBySection.set(section, cursor);
  state.lastAssetBySection.set(section, picks[picks.length - 1]);
  return picks;
}

function buildPool(section: string, realAssets: string[], assetsDir: string): string[] {
  if (section === "outro") {
    return resolveExplicit(OUTRO_RECAP_FILENAMES, assetsDir);
  }

  if (section === "intro") {
    // Intro leads with its own 00- asset(s), then teases the five main pieces
    // so the opening never sticks on a single image. This is a controlled
    // recap/teaser use, never a free-for-all over the whole video.
    const introAssets = byPrefix("00-", realAssets, assetsDir);
    const teaser = resolveExplicit(OUTRO_RECAP_FILENAMES, assetsDir);
    return dedupe([...introAssets, ...teaser]);
  }

  const prefix = SECTION_PREFIXES[section];
  if (prefix) {
    return byPrefix(prefix, realAssets, assetsDir);
  }

  return [];
}

function byPrefix(prefix: string, realAssets: string[], assetsDir: string): string[] {
  return realAssets
    .filter((name) => name.startsWith(prefix))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => path.join(assetsDir, name));
}

function resolveExplicit(filenames: string[], assetsDir: string): string[] {
  return filenames
    .map((name) => path.join(assetsDir, name))
    .filter((candidate) => fs.existsSync(candidate));
}

function listRealAssets(assetsDir: string): string[] {
  return fs
    .readdirSync(assetsDir)
    .filter((name) => SUPPORTED_EXTENSIONS.includes(path.extname(name).toLowerCase()))
    .filter((name) => !name.startsWith("scene-"));
}

function groupByScene(manifest: AssetManifestEntry[]): AssetManifestEntry[][] {
  const groups: AssetManifestEntry[][] = [];
  const indexByScene = new Map<number, number>();

  for (const entry of manifest) {
    const existing = indexByScene.get(entry.globalSceneIndex);

    if (existing === undefined) {
      indexByScene.set(entry.globalSceneIndex, groups.length);
      groups.push([entry]);
      continue;
    }

    groups[existing].push(entry);
  }

  return groups;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
