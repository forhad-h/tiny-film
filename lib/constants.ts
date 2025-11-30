export const LANGUAGES = [
  "English",
  "Arabic",
  "Urdu",
  "French",
  "Spanish",
] as const;

export const PLATFORMS = [
  "YouTube Shorts",
  "TikTok",
  "Instagram Reels",
  "Facebook",
] as const;

export const TONES = [
  "Inspirational",
  "Educational",
  "Reflective",
  "Motivational",
  "Storytelling",
] as const;

export const SOUND_STYLES = [
  "Nasheed",
  "Ambient",
  "Nature Sounds",
  "Silence",
] as const;

export const DEFAULT_SETTINGS = {
  language: "English",
  targetPlatform: "YouTube Shorts",
  tone: "Inspirational",
  preferredSoundStyle: "Nasheed",
} as const;
