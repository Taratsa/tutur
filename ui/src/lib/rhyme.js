export const RHYME_KIND_LABELS = {
  akhir: "rima akhir",
  awal: "rima awal",
};

export function rhymeKindLabel(kind) {
  return RHYME_KIND_LABELS[kind] ?? kind;
}

export function rhymeDisplay(key, kind) {
  return kind === "awal" ? `${key}-` : `-${key}`;
}

export function rhymePath(kind, key, page = 1) {
  return page === 1 ? `/rima/${kind}/${key}/` : `/rima/${kind}/${key}/${page}/`;
}
