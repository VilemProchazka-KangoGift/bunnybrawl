/** Shared Saturday morning palette for DOM and canvas UI. */
export const UI_THEME = {
  ink: '#192b54', paper: '#fffce9', action: '#ffdc45', leaf: '#98d969',
  sky: '#55b8e7', page: '#e3edf9', danger: '#b43c47', veil: '#192b5480',
} as const;
export function portraitUrl(name: string): string {
  return `${import.meta.env.BASE_URL}ui/portraits/${name.toLowerCase()}.png`;
}
