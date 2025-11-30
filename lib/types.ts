export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  type?: "concept" | "script" | "shots" | "error" | "suggestion";
}

export interface FilmGenerationState {
  step: "idle" | "validating-concept" | "generating-script" | "validating-script" | "planning-shots" | "generating-video" | "completed";
  concept?: string;
  script?: string;
  shots?: string;
  videoUrl?: string;
  videoUrls?: string[];
  language: string;
  targetPlatform: string;
  tone: string;
  preferredSoundStyle: string;
}

export interface ValidateConceptRequest {
  concept: string;
}

export interface GenerateScriptRequest {
  concept: string;
}

export interface ValidateScriptRequest {
  script: string;
}

export interface PlanShotsRequest {
  script: string;
  preferred_sound_style: string;
  target_platform: string;
}

export interface ApiResponse {
  result?: string;
  error?: string;
}
