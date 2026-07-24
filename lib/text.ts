export function countWords(value: string): number {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized) return 0;

  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("en", { granularity: "word" });
    return Array.from(segmenter.segment(normalized)).filter(
      (segment) => segment.isWordLike,
    ).length;
  }

  return normalized.split(/\s+/u).filter(Boolean).length;
}
