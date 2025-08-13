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

export interface UpdateKeybindingMessage {
  command: 'updateKeybinding';
  key?: string;
  enable: boolean;
  shortcutCommand: string;
}

export type IncomingMessage =
  | ReadyMessage
  | ShortcutAnswerMessage
  | ClosePlaygroundMessage
  | OpenPlaygroundMessage
  | QuitMessage
  | UpdateKeybindingMessage;

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

export interface Keybinding {
  key: string;
  enabled: boolean;
  disablingPossible: boolean;
  conditions?: string[];
}

export interface QuizShortcutNonRecursive {
  title: string;
  keys: Keybinding[];
  command: string;
}
export interface QuizShortcut extends QuizShortcutNonRecursive {
  relatedShortcuts: QuizShortcutNonRecursive[];
  enabled: boolean;
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
  maxWrongTries: number;
  debug?: boolean;
}
export type OutgoingMessage =
  | SetShortcutsMessage
  | PlaygroundClosedMessage
  | PlaygroundOpenedMessage;
