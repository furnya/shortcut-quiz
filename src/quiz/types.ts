export interface ReadyMessage {
  command: 'ready';
}

export interface ShortcutAnswerMessage {
  command: 'shortcutAnswer';
  shortcutCommand: string;
  correct: boolean;
}

export interface ClosePlaygroundMessage {
  command: 'closePlayground';
}
export interface OpenPlaygroundMessage {
  command: 'openPlayground';
}

export interface QuitMessage {
  command: 'quit';
}

export type IncomingMessage =
  | ReadyMessage
  | ShortcutAnswerMessage
  | ClosePlaygroundMessage
  | OpenPlaygroundMessage
  | QuitMessage;

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

export interface QuizShortcutNonRecursive {
  title: string;
  keys: string[];
  command: string;
}
export interface QuizShortcut extends QuizShortcutNonRecursive {
  relatedShortcuts: QuizShortcutNonRecursive[];
}

export interface PlaygroundClosedMessage {
  command: 'playgroundClosed';
}
export interface PlaygroundOpenedMessage {
  command: 'playgroundOpened';
}
export interface SetShortcutsMessage {
  command: 'setShortcuts';
  configKeyboardLanguage: 'en' | 'de';
  shortcuts: QuizShortcut[];
  keyMappings: KeyMappings;
}
export type OutgoingMessage =
  | SetShortcutsMessage
  | PlaygroundClosedMessage
  | PlaygroundOpenedMessage;
