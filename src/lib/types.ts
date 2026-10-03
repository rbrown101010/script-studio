/** "board" embeds an Excalidraw board; its content is the board's id */
export type BlockType = "p" | "h1" | "bullet" | "number" | "todo" | "images" | "board";
export type BlockColor = "yellow" | "blue" | "green" | "red" | "rose";
export type AttachmentKind = "image" | "video" | "audio" | "file" | "link";

export type Attachment = {
  id: string;
  kind: AttachmentKind;
  url: string | null;
  storageId: string | null;
  name: string | null;
  mime: string | null;
  size: number | null;
  /** 0..1 while uploading; undefined once stored */
  progress?: number;
  error?: string;
};

/** A comment on the whole script (blockKey null) or on one line, with files and links beneath it. */
export type Comment = {
  id: string;
  blockKey: string | null;
  /** Lines it was on before an edit moved it (so earlier versions show it where it was) */
  keyHistory?: string[];
  quote: string | null;
  text: string;
  authorName: string | null;
  /** Posted by an AI agent */
  agent: boolean;
  /** Written by the person viewing */
  mine: boolean;
  attachments: Attachment[];
  createdAt: number;
};

export type Block = {
  id: string;
  type: BlockType;
  content: string;
  checked?: boolean;
  color?: BlockColor | null;
  textColor?: TextColor | null;
  /** An "images" block's pictures, side by side */
  images?: Attachment[];
  source_block_id?: string | null;
};

export type VideoStatus = "inProduction" | "upcoming" | "done" | "idea";
export type VideoFormat = "long" | "short";

// "red" is stored for the fourth color but shown as purple, per the design
export const BLOCK_COLORS: { value: BlockColor; label: string; bg: string }[] = [
  { value: "yellow", label: "Yellow", bg: "var(--block-yellow)" },
  { value: "blue", label: "Blue", bg: "var(--block-blue)" },
  { value: "green", label: "Green", bg: "var(--block-green)" },
  { value: "red", label: "Purple", bg: "var(--block-red)" },
  // Stored as "rose" because "red" was already taken by purple
  { value: "rose", label: "Red", bg: "var(--block-rose)" },
];

export type TextColor = "gray" | "red" | "orange" | "green" | "blue" | "purple";
export const TEXT_COLORS: { value: TextColor; label: string; hex: string }[] = [
  { value: "gray", label: "Gray", hex: "var(--text-gray)" },
  { value: "red", label: "Red", hex: "var(--text-red)" },
  { value: "orange", label: "Orange", hex: "var(--text-orange)" },
  { value: "green", label: "Green", hex: "var(--text-green)" },
  { value: "blue", label: "Blue", hex: "var(--text-blue)" },
  { value: "purple", label: "Purple", hex: "var(--text-purple)" },
];
export const textHex = (c: TextColor | null | undefined) => TEXT_COLORS.find((x) => x.value === c)?.hex;

export const colorBg = (c: BlockColor | null | undefined) => BLOCK_COLORS.find((x) => x.value === c)?.bg;

export const STATUSES: { value: VideoStatus; label: string; dot: string }[] = [
  { value: "inProduction", label: "In production", dot: "#d97706" },
  { value: "upcoming", label: "Upcoming", dot: "#9a9a9a" },
  { value: "done", label: "Done", dot: "#15803d" },
  { value: "idea", label: "Idea", dot: "#a78bfa" },
];

/** Label and dot for a status (anything unknown, like an old status, reads as In production). */
export const statusOf = (s: string) => STATUSES.find((x) => x.value === s) ?? STATUSES[0];

export type Sponsorship = "none" | "noSponsor" | "dedicated" | "integration" | "adRead";

/** One platform's post: caption, link in bio, extra fields, and whether it's been posted. */
export type CaptionPlatform = {
  id: string;
  platform: string;
  caption: string;
  linkInBio: string;
  posted: boolean;
  fields: { id: string; label: string; value: string }[];
};

export const CAPTION_PLATFORMS = ["Instagram", "TikTok", "YouTube", "YouTube Shorts", "X", "LinkedIn", "Facebook", "Threads"];

/** "none" means nobody has decided yet; "noSponsor" means it's decided there's no sponsor. */
export const SPONSORSHIPS: { value: Sponsorship; label: string; pill: string }[] = [
  { value: "none", label: "None", pill: "" },
  { value: "noSponsor", label: "No sponsor", pill: "bg-(--c-b-f1f1ef) text-(--c-t-6b6b6b)" },
  { value: "dedicated", label: "Dedicated", pill: "bg-(--c-b-efe9fb) text-(--c-t-6d3fc9)" },
  { value: "integration", label: "Integration", pill: "bg-(--c-b-e7eefb) text-(--c-t-2358d8)" },
  { value: "adRead", label: "Ad read", pill: "bg-(--c-b-fdf1dc) text-(--c-t-a15c07)" },
];

/** A paid sponsorship (dedicated, integration or ad read). */
export const isPaidSponsor = (s: string | undefined | null) => s === "dedicated" || s === "integration" || s === "adRead";

export const FORMATS: { value: VideoFormat; label: string }[] = [
  { value: "long", label: "Long-form" },
  { value: "short", label: "Short-form" },
];
