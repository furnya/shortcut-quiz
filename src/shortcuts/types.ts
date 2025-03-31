export interface ShortcutImport {
  command: string;
  key: string;
  when?: string;
  title?: string;
  origin?: string;
}

export interface Shortcut {
  title: string;
  keys: { [key: string]: string[] | null };
  learningState: number;
  origins: string[];
  important: boolean;
}

export interface Shortcuts {
  [command: string]: Shortcut;
}
