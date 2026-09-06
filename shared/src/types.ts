// Kontrak data antara scripts/prepare-data.mjs (site.json) dan konsumennya:
// api/src/database.ts saat build, dan halaman prerender pada UI.

export interface ExtraItem {
  text: string;
  slug: string | null;
}

export interface PreparedDefinition {
  id: number;
  type: number | null;
  html: string;
  text: string;
}

export interface PreparedExtras {
  pronunciation: string | null;
  etymology: string | null;
  examples: ExtraItem[];
  derivations: ExtraItem[];
  compounds: ExtraItem[];
  proverbs: ExtraItem[];
  idioms: ExtraItem[];
}

export interface EtymologyRelation {
  id: number;
  termId: string;
  lang: string;
  term: string;
  normalizedTerm: string;
  relationType: string;
  relatedTermId: string | null;
  relatedLang: string | null;
  relatedTerm: string | null;
  position: number | null;
  groupTag: string | null;
  parentTag: string | null;
  parentPosition: number | null;
}

export interface KaikkiForm {
  text: string;
  tags: string[];
}

export interface KaikkiEntry {
  id: number;
  word: string;
  normalizedWord: string;
  partOfSpeech: string;
  etymology: string | null;
  pronunciations: string[];
  hyphenations: string[];
  forms: KaikkiForm[];
  derived: string[];
  synonyms: string[];
}

export interface PreparedEntry {
  id: number;
  word: string;
  normalizedWord: string;
  slug: string;
  letter: string;
  definitions: PreparedDefinition[];
  syllabifications: string[];
  frequency: number | null;
  root: string | null;
  rootRank: number | null;
  rootFrequency?: number;
  extras: PreparedExtras | null;
}

export interface BakuRelation {
  id: number;
  word: string;
  normalizedWord: string;
  wrong: string;
  normalizedWrong: string;
  explanation: string;
  clue: string | null;
}

export interface SinonimRelation {
  id: number;
  word: string;
  normalizedWord: string;
  wrong: string;
  normalizedWrong: string;
  type: string | null;
  explanation: string;
  usageA: string;
  usageB: string;
}

export interface AntonymRelation {
  id: number;
  word: string;
  normalizedWord: string;
  wrong: string;
  normalizedWrong: string;
  oppositionType: string | null;
  field: string | null;
  confidence: string | null;
  explanation: string;
  usageA: string;
  usageB: string;
  note: string | null;
}

export interface SlangRelation {
  id: number;
  slang: string;
  normalizedSlang: string;
  formal: string;
  normalizedFormal: string;
  inDictionary: boolean;
  categories: string[];
}

export interface FamilyGroup {
  root: string;
  rootSlug: string;
  members: { text: string; slug: string | null; frequency: number | null }[];
}

export interface PreparedStats {
  dictionaryRecords: number;
  uniqueHeadwords: number;
  slugCollisionCount: number;
  bakuRecords: number;
  sinonimRecords: number;
  antonimRecords: number;
  slangRecords?: number;
  enrichedWords?: number;
  extrasEntries?: number;
  familyRoots?: number;
  familyMembers?: number;
  searchRecords?: number;
  etymologyRecords?: number;
  etymologyTerms?: number;
  etymologyLinkedTerms?: number;
  kaikkiRecords?: number;
  kaikkiTerms?: number;
  kaikkiEtymologyTerms?: number;
  kaikkiHyphenationTerms?: number;
}

export interface PreparedData {
  stats: PreparedStats;
  entries: PreparedEntry[];
  relations: {
    baku: BakuRelation[];
    sinonim: SinonimRelation[];
    antonim: AntonymRelation[];
    slang?: SlangRelation[];
    etymology?: EtymologyRelation[];
  };
  kaikki?: KaikkiEntry[];
  families: FamilyGroup[];
}
