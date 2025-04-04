export interface ShortcutImport {
  command: string;
  key: string;
  when?: string;
  title?: string;
  origin?: string;
}

export interface ShortcutNonRecursive {
  title: string;
  keys: { [key: string]: string[] | null };
  origins: string[];
}
export interface Shortcut extends ShortcutNonRecursive {
  relatedShortcuts?: ShortcutsNonRecursive;
  important: boolean;
  learningState: number;
}

export interface Shortcuts {
  [command: string]: Shortcut;
}

export interface ShortcutsNonRecursive {
  [command: string]: ShortcutNonRecursive;
}
