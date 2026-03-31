/** Random number in [min, max] from a tuple range. */
export function randRange(range: [number, number]): number {
  return range[0] + Math.random() * (range[1] - range[0]);
}

/** Pick a random item using weighted selection. Items must have a `weight` field. */
export function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const totalWeight = items.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * totalWeight;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}
