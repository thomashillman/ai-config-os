/**
 * Split an array into contiguous chunks of at most `size` elements.
 * Used to avoid OS argv limits when spawning Prettier with many paths.
 */
export function chunkArray(items, size) {
  if (size < 1) {
    throw new Error("chunk size must be >= 1");
  }
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
