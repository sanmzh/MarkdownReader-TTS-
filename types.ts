export enum VoiceName {
  Kore = 'Kore',
  Puck = 'Puck',
  Charon = 'Charon',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr',
}

export type TTSProvider = 'gemini' | 'browser' | 'openai';

export interface VoiceOption {
  id: string; // Gemini enum key or Browser voice URI/Name
  name: string;
  provider: TTSProvider;
  gender?: 'Male' | 'Female' | 'Neutral'; // Optional for browser voices
}

export const OPENAI_VOICES: VoiceOption[] = [
  { id: 'alloy', name: 'OpenAI - Alloy (中性)', provider: 'openai', gender: 'Neutral' },
  { id: 'echo', name: 'OpenAI - Echo (男声)', provider: 'openai', gender: 'Male' },
  { id: 'fable', name: 'OpenAI - Fable (英式)', provider: 'openai', gender: 'Neutral' },
  { id: 'onyx', name: 'OpenAI - Onyx (深沉)', provider: 'openai', gender: 'Male' },
  { id: 'nova', name: 'OpenAI - Nova (女声)', provider: 'openai', gender: 'Female' },
  { id: 'shimmer', name: 'OpenAI - Shimmer (清亮)', provider: 'openai', gender: 'Female' },
];

export type SegmentType = 'text' | 'image' | 'header' | 'list' | 'table' | 'blockquote' | 'hr';

export interface Segment {
  id: string;
  type: SegmentType;
  content: string; // Text content (without # for headers) or Image URL
  alt?: string; // For images
  originalText: string; // The raw markdown
  metadata?: {
    level?: number; // 1-6 for headers
    listType?: 'ordered' | 'unordered';
  };
}

export interface AppState {
  isPlaying: boolean;
  currentSegmentIndex: number;
  highlightColor: string;
  markdown: string;
  voice: string;
  provider: TTSProvider;
}