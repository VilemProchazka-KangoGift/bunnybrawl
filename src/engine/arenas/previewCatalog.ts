/** Lightweight arena selection data; no simulation or drawing imports. */
export interface ArenaPreview {
  id: string;
  playable?: boolean;
  previewGradient: string;
  previewIcon: string;
  translations: Record<string, string>;
}

export const BUILTIN_ARENA_PREVIEWS = {
  meadow: {
    id: 'meadow',
    previewGradient: 'linear-gradient(to bottom, #4A90D9 0%, #87CEEB 60%, #4a8c3f 100%)',
    previewIcon: '\u{1F33F}',
    translations: { en: 'Meadow', cs: 'Louka', hi: '\u0918\u093E\u0938 \u0915\u093E \u092E\u0948\u0926\u093E\u0928', fil: 'Damuhan' },
  },
  winterLake: {
    id: 'winter_lake',
    previewGradient: 'linear-gradient(to bottom, #2C3E6B 0%, #8FA8C8 60%, #D8E8F0 100%)',
    previewIcon: '\u2744\uFE0F',
    translations: { en: 'Winter Lake', cs: 'Zamrzl\u00E9 jezero', hi: '\u0938\u0930\u094D\u0926\u0940 \u0915\u0940 \u091D\u0940\u0932', fil: 'Lawa sa Taglamig' },
  },
  volcano: {
    id: 'volcano',
    previewGradient: 'linear-gradient(to bottom, #1A0505 0%, #8B2500 50%, #FF4500 100%)',
    previewIcon: '\u{1F30B}',
    translations: { en: 'Volcano', cs: 'Sopka', hi: '\u091C\u094D\u0935\u093E\u0932\u093E\u092E\u0941\u0916\u0940', fil: 'Bulkan' },
  },
  castle: {
    id: 'castle',
    previewGradient: 'linear-gradient(to bottom, #0A0A2E 0%, #1A1A4E 40%, #3A3A5E 100%)',
    previewIcon: '\u{1F3F0}',
    translations: { en: 'Castle', cs: 'Hrad', hi: '\u0915\u093F\u0932\u093E', fil: 'Kastilyo' },
  },
  candyLand: {
    id: 'candy_land',
    previewGradient: 'linear-gradient(to bottom, #FFB6C1 0%, #FFDAB9 50%, #FFE4E1 100%)',
    previewIcon: '\u{1F36D}',
    translations: { en: 'Candy Land', cs: 'Cukr\u00E1rna', hi: '\u0915\u0948\u0902\u0921\u0940 \u0932\u0948\u0902\u0921', fil: 'Candy Land' },
  },
  treetops: {
    id: 'treetops',
    previewGradient: 'linear-gradient(to bottom, #1A3A1A 0%, #2D5A2D 40%, #4A8A4A 100%)',
    previewIcon: '\u{1F333}',
    translations: { en: 'Treetops', cs: 'Koruny strom\u016F', hi: '\u092A\u0947\u0921\u093C\u094B\u0902 \u0915\u0940 \u091A\u094B\u091F\u0940', fil: 'Tuktok ng Puno' },
  },
  underwater: {
    id: 'underwater',
    previewGradient: 'linear-gradient(to bottom, #0A3A6B 0%, #0E4A8B 40%, #1A6AAA 100%)',
    previewIcon: '\u{1F420}',
    translations: { en: 'Underwater', cs: 'Pod vodou', hi: '\u092A\u093E\u0928\u0940 \u0915\u0947 \u0928\u0940\u091A\u0947', fil: 'Ilalim ng Tubig' },
  },
  hauntedGraveyard: {
    id: 'haunted_graveyard',
    previewGradient: 'linear-gradient(to bottom, #0A0015 0%, #1A0A30 40%, #2A1540 100%)',
    previewIcon: '\u{1F47B}',
    translations: { en: 'Haunted Graveyard', cs: 'Stra\u0161ideln\u00FD h\u0159bitov', hi: '\u092D\u0942\u0924\u093F\u092F\u093E \u0915\u092C\u094D\u0930\u093F\u0938\u094D\u0924\u093E\u0928', fil: 'Sementeryo' },
  },
  rooftops: {
    id: 'rooftops',
    previewGradient: 'linear-gradient(to bottom, #FF6B35 0%, #FF8C5A 40%, #3A2A4A 100%)',
    previewIcon: '\u{1F3D9}\u{FE0F}',
    translations: { en: 'Rooftops', cs: 'St\u0159echy', hi: '\u091B\u0924\u0947\u0902', fil: 'Bubungan' },
  },
  spaceStation: {
    id: 'space_station',
    previewGradient: 'linear-gradient(to bottom, #000010 0%, #0A0A2A 40%, #1A1A3A 100%)',
    previewIcon: '\u{1F680}',
    translations: { en: 'Space Station', cs: 'Vesm\u00EDrn\u00E1 stanice', hi: '\u0905\u0902\u0924\u0930\u093F\u0915\u094D\u0937 \u0938\u094D\u091F\u0947\u0936\u0928', fil: 'Kalawakan' },
  },
  waterfall: {
    id: 'waterfall',
    previewGradient: 'linear-gradient(to bottom, #3A80C9 0%, #6ABED8 40%, #3A7A5A 100%)',
    previewIcon: '\u{1F4A7}',
    translations: { en: 'Waterfall', cs: 'Vodopád', hi: 'झरना', fil: 'Talon' },
  },
  lobby: {
    id: 'lobby',
    playable: false,
    previewGradient: 'linear-gradient(to bottom, #4A90D9 0%, #87CEEB 60%, #4a8c3f 100%)',
    previewIcon: '\u{1F3E1}',
    translations: { en: 'Lobby', cs: 'Lobby', hi: 'Lobby', fil: 'Lobby' },
  },
} satisfies Record<string, ArenaPreview>;

const previews = new Map<string, ArenaPreview>(Object.values(BUILTIN_ARENA_PREVIEWS).map(preview => [preview.id, preview]));

/** Full/custom pack registration also updates its small selector entry. */
export function registerArenaPreview(preview: ArenaPreview): void {
  previews.set(preview.id, {
    id: preview.id,
    playable: preview.playable,
    previewGradient: preview.previewGradient,
    previewIcon: preview.previewIcon,
    translations: preview.translations,
  });
}

export function listPlayableArenaPreviews(): ArenaPreview[] {
  return Array.from(previews.values()).filter(preview => preview.playable !== false)
    .map(preview => ({ ...preview }));
}

export function getArenaPreviewDisplayName(id: string, lang: string): string {
  const preview = previews.get(id);
  return preview?.translations[lang] ?? preview?.translations.en ?? id;
}
