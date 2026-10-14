// Each person on the team has their own color, used in their initials circle

/** Distinct, mid-tone colors that read with white initials in light and dark mode */
export const PERSON_COLORS = ["#3B6FD9", "#E0662B", "#2F9E44", "#8E44C9", "#D6336C", "#0F9488", "#C47F00", "#5C5FD6", "#9A6B3F", "#5F6B7A"];

/** A person's color by their place on the team (in order of joining, so nobody's color changes) */
export const personColor = (index: number) => PERSON_COLORS[((index % PERSON_COLORS.length) + PERSON_COLORS.length) % PERSON_COLORS.length];

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
