export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  size?: string;
}

export interface AisaNote {
  id: string;
  title: string;
  content: string;
  modifiedTime: string;
}

export interface Message {
  id: string;
  sender: 'user' | 'aisa';
  text: string;
  audioUrl?: string;
  timestamp: string;
  isSearching?: boolean;
  citations?: { title: string; url: string }[];
}

export enum VoiceName {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr'
}

export interface TranslationConfig {
  sourceLanguage: string;
  targetLanguage: string;
  realtimeTranslate: boolean;
}
