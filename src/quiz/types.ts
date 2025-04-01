export interface ReadyMessage {
  command: 'ready';
}

export interface ShortcutAnswerMessage {
  command: 'shortcutAnswer';
  shortcutCommand: string;
  correct: boolean;
}
export type IncomingMessage = ReadyMessage | ShortcutAnswerMessage;

export interface DisplayKeys {
  de: string;
  en: string;
}

export interface KeyMappings {
  [key: string]: {
    keyCode: string;
    displayKeys: DisplayKeys;
  };
}

export interface QuizShortcut {
  title: string;
  keys: string[];
  command: string;
}

export interface OutgoingMessage {
  command: 'setShortcuts';
  configKeyboardLanguage: 'en' | 'de';
  shortcuts: QuizShortcut[];
  keyMappings: KeyMappings;
}
