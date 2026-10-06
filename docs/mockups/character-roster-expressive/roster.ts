export const expressiveGroups = {
  A: ['Bunny', 'Fox', 'Frog', 'Bear', 'Owl'],
  B: ['Cat', 'Wolf', 'Panda', 'Pig', 'Cow'],
  C: ['Goat', 'Horse', 'Sheep', 'Monkey', 'Tiger'],
  D: ['Rhino', 'Hedgehog', 'Chick', 'Axolotl', 'Bunny'],
} as const;

export type ExpressiveGroup = keyof typeof expressiveGroups;

export const expressiveSizes: Record<string, number> = {
  Bunny: 40, Fox: 43, Frog: 41, Bear: 42, Owl: 39,
  Cat: 42, Wolf: 44, Panda: 42, Pig: 40, Cow: 44,
  Goat: 43, Horse: 46, Sheep: 42, Monkey: 43, Tiger: 44,
  Rhino: 44, Hedgehog: 41, Chick: 37, Axolotl: 45,
};
