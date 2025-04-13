export interface ShortcutImport {
  command: string;
  key: string;
  when?: string;
  title?: string;
  title_ai?: string;
  origin?: string;
}
export interface PreselectedShortcuts {
  [command: string]: {
    relatedShortcuts?: string[];
    preferredConditions?: string[];
  };
}

export interface Keybinding {
  enabled: boolean;
  disablingPossible: boolean;
  conditions?: string[];
}

export interface Keybindings {
  [key: string]: Keybinding;
}

export interface ShortcutNonRecursive {
  title: string;
  keybindings: Keybindings;
  origins: string[];
}
export interface Shortcut extends ShortcutNonRecursive {
  relatedShortcuts?: ShortcutsNonRecursive;
  enabled: boolean;
  learningState: number;
}

export interface Shortcuts {
  [command: string]: Shortcut;
}

export interface ShortcutsNonRecursive {
  [command: string]: ShortcutNonRecursive;
}
