export const remainingAnimals = [
  'Wolf', 'Panda', 'Pig', 'Cow', 'Goat', 'Horse', 'Sheep',
  'Monkey', 'Tiger', 'Rhino', 'Hedgehog', 'Chick', 'Axolotl',
] as const;

export type RemainingAnimal = typeof remainingAnimals[number];

export const groups = {
  A: ['Wolf', 'Panda', 'Pig', 'Cow', 'Goat'],
  B: ['Horse', 'Sheep', 'Monkey', 'Tiger', 'Rhino'],
  C: ['Hedgehog', 'Chick', 'Axolotl', 'Bunny', 'Fox'],
} as const;

export function isRemainingAnimal(name: string | null): name is RemainingAnimal {
  return remainingAnimals.some(animal => animal === name);
}

/** Preview sizes in logical game pixels; this is a review study, not a runtime atlas. */
export const previewSize: Record<RemainingAnimal, number> = {
  Wolf: 41, Panda: 40, Pig: 39, Cow: 42, Goat: 42,
  Horse: 43, Sheep: 40, Monkey: 41, Tiger: 42, Rhino: 42,
  Hedgehog: 41, Chick: 38, Axolotl: 43,
};
