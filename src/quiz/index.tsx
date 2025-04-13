import { h, render, Component, Fragment } from 'preact';
import htm from 'htm';
import {
  DisplayKeys,
  IncomingMessage,
  KeyMappings,
  OutgoingMessage,
  QuizShortcut,
  QuizShortcutNonRecursive,
} from './types';

const html = htm.bind(h);
declare function acquireVsCodeApi(): any;
const vscode: {
  postMessage: (message: IncomingMessage) => void;
} = acquireVsCodeApi();

let keyMappings: KeyMappings = {};
let configKeyboardLanguage: 'en' | 'de' = 'en';

interface ShortcutQuizState {
  shortcuts: QuizShortcut[];
  currentShortcutIndex: number;
  currentStepIndices: number[];
  currentPossibleSteps: ShortcutSteps[];
  currentEnabledSteps: ShortcutSteps[];
  currentRelatedShortcuts: { command: string; title: string; steps: ShortcutSteps[] }[];
  currentCapturedSteps: ShortcutStep[] | null;
  showAnswer: boolean;
  isComplete: boolean;
  isFadingOut: boolean;
  pressedKeys: { key: string | null; keyCode: string }[];
  feedback: { type: string } | null;
  feedbackKey: number;
  playgroundOpen: boolean;
  correctCounter: number;
}

interface ShortcutStep {
  displayKeys: DisplayKeys;
  key: string;
  modifiers: string[];
}

interface ShortcutSteps {
  steps: ShortcutStep[];
  enabled: boolean;
  disablingPossible: boolean;
  conditions?: string[];
  rawKeys: string;
}

class ShortcutQuiz extends Component<{}, ShortcutQuizState> {
  feedbackTimer: null;
  fadeOutTimer: null;
  previousFeedbackKey: number;
  constructor(props: {}) {
    super(props);
    this.state = {
      shortcuts: [],
      currentShortcutIndex: 0,
      currentStepIndices: [],
      currentPossibleSteps: [],
      currentEnabledSteps: [],
      currentRelatedShortcuts: [],
      currentCapturedSteps: null,
      showAnswer: false,
      feedback: null,
      isComplete: false,
      isFadingOut: false,
      pressedKeys: [],
      feedbackKey: 0,
      playgroundOpen: false,
      correctCounter: 0,
    };
    this.feedbackTimer = null;
    this.fadeOutTimer = null;
    this.previousFeedbackKey = 0;
  }

  componentDidMount() {
    window.addEventListener('message', this.handleMessage);
    document.addEventListener('keydown', this.handleKeydown);
    document.addEventListener('keyup', this.handleKeyup);
    vscode.postMessage({ command: 'ready' });
  }

  componentWillUnmount() {
    window.removeEventListener('message', this.handleMessage);
    document.removeEventListener('keydown', this.handleKeydown);
    document.removeEventListener('keyup', this.handleKeyup);
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
    }
    if (this.fadeOutTimer) {
      clearTimeout(this.fadeOutTimer);
    }
  }

  handleMessage = (event: { data: OutgoingMessage }) => {
    const message = event.data;
    if (message.command === 'setShortcuts') {
      configKeyboardLanguage = message.configKeyboardLanguage;
      keyMappings = message.keyMappings;
      this.initializeShortcuts(message.shortcuts);
      window.focus();
    } else if (message.command === 'playgroundOpened') {
      this.setState({ playgroundOpen: true });
    } else if (message.command === 'playgroundClosed') {
      this.setState({ playgroundOpen: false });
    }
  };

  sendPlaygroundMessage = (close: boolean) => {
    const message: IncomingMessage = {
      command: close ? 'closePlayground' : 'openPlayground',
    };
    vscode.postMessage(message);
  };

  quit = () => {
    this.sendPlaygroundMessage(true);
    vscode.postMessage({ command: 'quit' });
  };

  translateVSCodeKey = (vsCodeKey: string) => {
    const key = vsCodeKey.toLowerCase();
    return (keyMappings[key]?.keyCode || vsCodeKey).toLowerCase();
  };

  initializeShortcuts = (shortcuts: QuizShortcut[]) => {
    this.setState({ shortcuts }, () => {
      this.selectShortcutByIndex(0);
    });
  };

  selectShortcutByIndex(index: number) {
    const { shortcuts } = this.state;
    const currentPossibleSteps = this.getStepsFromShortcuts(shortcuts[index]);
    const currentEnabledSteps = currentPossibleSteps.filter((s) => s.enabled);
    const currentRelatedShortcuts =
      shortcuts[index].relatedShortcuts?.map((s) => ({
        command: s.command,
        title: s.title,
        steps: this.getStepsFromShortcuts(s),
      })) || [];

    console.debug('Current steps:', currentPossibleSteps);
    this.setState({
      currentShortcutIndex: index,
      currentPossibleSteps,
      currentEnabledSteps,
      currentStepIndices: currentEnabledSteps.map((_) => 0),
      currentRelatedShortcuts: currentRelatedShortcuts,
      currentCapturedSteps: null,
      feedback: null,
      showAnswer: false,
    });
  }

  getStepsFromShortcuts = (shortcut: QuizShortcutNonRecursive) => {
    if (!shortcut || !shortcut.keys.length) return [];

    const steps: ShortcutSteps[] = [];
    for (const k of shortcut.keys) {
      const step: ShortcutStep[] = [];
      for (const keymatch of k.key.split(' ')) {
        // Split by + to handle key combinations
        const vsCodeKeys = keymatch.toLowerCase().split('+');
        step.push({
          displayKeys: keyMappings[vsCodeKeys[vsCodeKeys.length - 1]]?.displayKeys,
          key: this.translateVSCodeKey(vsCodeKeys[vsCodeKeys.length - 1]),
          modifiers: vsCodeKeys
            .slice(0, vsCodeKeys.length - 1)
            .map((k) => this.translateVSCodeKey(k)),
        });
      }
      steps.push({
        steps: step,
        enabled: k.enabled,
        conditions: k.conditions,
        disablingPossible: k.disablingPossible,
        rawKeys: k.key,
      });
    }
    return steps;
  };

  getKeyAndKeyCode(event: KeyboardEvent) {
    let key: string | null = event.key.toLowerCase();
    let keyCode = event.code.toLowerCase();
    if (keyCode.startsWith('key') && !/[a-z]/.test(key)) {
      keyCode = keyCode.replace('key', '');
    }
    if (keyCode.startsWith('numpad')) {
      key = null;
    }
    return { key, keyCode };
  }

  handleKeyup = (event: KeyboardEvent) => {
    console.debug('Keyup event:', event);
    const { pressedKeys } = this.state;
    const keyPair = this.getKeyAndKeyCode(event);
    const keyIndex = pressedKeys.findIndex(
      (k) => k.key === keyPair.key && k.keyCode === keyPair.keyCode,
    );
    if (keyIndex >= 0) {
      pressedKeys.splice(keyIndex, 1);
      this.setState({ pressedKeys }, () => {
        console.debug('Pressed keys:', structuredClone(this.state.pressedKeys));
      });
    }
  };

  handleKeydown = async (event: KeyboardEvent) => {
    console.debug('Keydown event:', event);
    event.preventDefault();
    event.stopPropagation();
    const { currentStepIndices, currentEnabledSteps, showAnswer, pressedKeys } = this.state;
    const { key: pressedKey, keyCode: pressedKeyCode } = this.getKeyAndKeyCode(event);
    console.debug('Pressed key, code:', pressedKey, pressedKeyCode);
    if (!pressedKeys.some((k) => k.key === pressedKey && k.keyCode === pressedKeyCode)) {
      this.setState(
        {
          pressedKeys: [...pressedKeys, { key: pressedKey, keyCode: pressedKeyCode }],
        },
        () => {
          console.debug('Pressed keys:', structuredClone(this.state.pressedKeys));
        },
      );
    }

    // If answer is already showing, don't process keypresses
    if (showAnswer) {
      if (
        event.key === 'Enter' &&
        event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        this.handleNext();
      }
      return;
    }

    const steps = currentEnabledSteps.map((s, i) => s.steps[currentStepIndices[i]]);
    console.debug('Steps:', steps);
    if (!steps.length) return;
    if (pressedKey && ['control', 'shift', 'alt', 'meta'].includes(pressedKey)) {
      return;
    }
    let correctSteps = steps.map((_) => false);
    for (const [i, step] of steps.entries()) {
      const { key, modifiers } = step;

      console.debug('Expected key:', key);
      console.debug('Expected modifiers:', modifiers);

      // Check if the pressed key matches the current step
      if (
        modifiers.includes('control') === event.ctrlKey &&
        modifiers.includes('shift') === event.shiftKey &&
        modifiers.includes('alt') === event.altKey &&
        modifiers.includes('meta') === event.metaKey &&
        [pressedKey, pressedKeyCode].includes(key)
      ) {
        correctSteps[i] = true;
      }
    }
    const newCurrentStep = currentStepIndices.map((s, i) => (correctSteps[i] ? s + 1 : 0));
    if (correctSteps.some((s) => s)) {
      const completedSteps = newCurrentStep.findIndex(
        (s, i) => s >= currentEnabledSteps[i].steps.length,
      );
      if (completedSteps >= 0) {
        this.handleCorrectAnswer(currentEnabledSteps[completedSteps].steps);
      } else {
        this.setState({
          currentStepIndices: newCurrentStep,
          feedback: { type: 'progress' },
        });
      }
    } else {
      if (this.feedbackTimer) {
        clearTimeout(this.feedbackTimer);
      }
      if (this.fadeOutTimer) {
        clearTimeout(this.fadeOutTimer);
      }
      // Reset on incorrect key
      this.setState({
        currentStepIndices: newCurrentStep,
        feedback: { type: 'incorrect' },
        feedbackKey: this.state.feedbackKey + 1, // Increment key to force re-render
      });
    }
  };

  handleCorrectAnswer = (steps: ShortcutStep[]) => {
    const { shortcuts, currentShortcutIndex, correctCounter } = this.state;
    const current = shortcuts[currentShortcutIndex];

    this.setState({
      showAnswer: true,
      feedback: { type: 'correct' },
      correctCounter: correctCounter + 1,
      currentCapturedSteps: steps,
    });

    vscode.postMessage({
      command: 'shortcutAnswer',
      correct: true,
      shortcutCommand: current.command,
    });
  };

  handleShowAnswer = () => {
    const { shortcuts, currentShortcutIndex } = this.state;
    const current = shortcuts[currentShortcutIndex];

    this.setState({
      showAnswer: true,
      feedback: null,
    });

    vscode.postMessage({
      command: 'shortcutAnswer',
      correct: false,
      shortcutCommand: current.command,
    });
  };

  handleNext = () => {
    const { shortcuts, currentShortcutIndex } = this.state;
    const nextIndex = currentShortcutIndex + 1;

    if (nextIndex >= shortcuts.length) {
      // Quiz complete
      this.setState({ isComplete: true });
      return;
    }
    this.selectShortcutByIndex(nextIndex);
  };

  handleRestart = () => {
    this.selectShortcutByIndex(0);
    this.setState({
      isComplete: false,
      correctCounter: 0,
    });
  };

  renderCommand(title: string, command: string) {
    return (
      <Fragment>
        <code class="command-title">{title}</code> (command:{' '}
        <span class="command-command">{command}</span>)
      </Fragment>
    );
  }

  getActive(key: string) {
    const { pressedKeys } = this.state;
    return pressedKeys.find((k) => k.key === key || k.keyCode === key) ? 'active' : '';
  }

  renderKeybinding(keybinding: ShortcutStep[]) {
    return keybinding.map((step, stepIndex) => (
      <Fragment key={stepIndex}>
        {step.modifiers.map((key, i) => (
          <Fragment key={i}>
            <span className={`keyboard-key ${this.getActive(key)}`}>{key}</span>
            <span class="keyboard-key-connector">+</span>
          </Fragment>
        ))}
        <span className={`keyboard-key ${this.getActive(step.key)}`}>
          {step.displayKeys?.[configKeyboardLanguage] ?? step.key}
        </span>
        {stepIndex < keybinding.length - 1 && <span class="keyboard-key-connector"> then </span>}
      </Fragment>
    ));
  }

  renderKeyboardHint(title: string, command: string) {
    const { currentPossibleSteps, currentRelatedShortcuts } = this.state;

    if (currentPossibleSteps.length === 0) return null;

    const formatSteps = (steps: ShortcutSteps[], subCommand: string) => (
      <div class="shortcuts-table">
        <table class="grid-layout">
          <thead>
            <tr>
              <th>Key(s)</th>
              <th>Conditions</th>
              <th title="Enabled for Quiz">Enabled*</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s, index) => (
              <tr key={index}>
                <td className="keyboard-hint">{this.renderKeybinding(s.steps)}</td>
                <td>
                  {s.conditions?.map((condition, condIndex) => (
                    <Fragment key={condIndex}>
                      <span>{condition}</span>
                      {condIndex < s.conditions!.length - 1 && <br />}
                    </Fragment>
                  ))}
                </td>
                <td>{s.enabled ? 'Yes' : 'No'}</td>
                <td>
                  <button
                    class="keyboard-key disable-button"
                    onClick={() => this.sendUpdateKeybindingMessage(s, subCommand)}
                    disabled={s.disablingPossible ? false : true}
                  >
                    {s.enabled ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

    return (
      <div class="answer">
        The shortcuts for {this.renderCommand(title, command)} are
        {formatSteps(currentPossibleSteps, command)}
        {currentRelatedShortcuts.length > 0 && (
          <details open class="related-shortcuts">
            <summary>Related Shortcuts:</summary>
            <div class="related-shortcuts-list">
              {currentRelatedShortcuts.map((r, rIndex) => (
                <div>
                  <span>{this.renderCommand(r.title, r.command)}</span>
                  {formatSteps(r.steps, r.command)}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    );
  }

  sendUpdateKeybindingMessage(steps: ShortcutSteps, command: string) {
    const { currentPossibleSteps, currentRelatedShortcuts } = this.state;
    vscode.postMessage({
      command: 'updateKeybinding',
      key: steps.rawKeys,
      enable: !steps.enabled,
      shortcutCommand: command,
    });
    steps.enabled = !steps.enabled;
    this.setState({ currentPossibleSteps, currentRelatedShortcuts });
  }

  renderFeedback = () => {
    const { feedback, feedbackKey, currentCapturedSteps } = this.state;

    if (!feedback) return null;

    const feedbackText = {
      correct: 'Correct!',
      incorrect: 'Incorrect key, try again!',
      progress: 'Keep going...',
    }[feedback.type];
    return (
      <div
        key={feedback.type === 'incorrect' ? feedbackKey : undefined}
        class={`feedback ${feedback.type}`}
      >
        {feedbackText}
        {feedback.type === 'correct' && (
          <span class="captured-shortcut">
            {' '}
            You pressed: {this.renderKeybinding(currentCapturedSteps ?? [])}
          </span>
        )}
      </div>
    );
  };

  render() {
    const { shortcuts, currentShortcutIndex, showAnswer, isComplete, playgroundOpen } = this.state;

    if (shortcuts.length === 0) {
      return html`<div>Loading...</div>`;
    }

    if (isComplete) {
      return html`
        <div class="completion">
          <h2>Quiz Complete!</h2>
          <p>You've finished the keyboard shortcuts quiz.</p>
          <p>
            You've answered ${this.state.correctCounter} out of ${shortcuts.length} questions
            correctly.
          </p>
          <button class="keyboard-key" onClick=${this.handleRestart}>Start Over</button>
          <br />
          <br />
          <button class="keyboard-key" onClick=${this.quit}>Quit</button>
        </div>
      `;
    }

    const current = shortcuts[currentShortcutIndex];

    return (
      <div class="app-main">
        <div class="progress">
          <span>
            Question {currentShortcutIndex + 1}/{shortcuts.length}
          </span>
          <button class="keyboard-key" onClick={() => this.sendPlaygroundMessage(playgroundOpen)}>
            {playgroundOpen ? 'Close' : 'Open'} Editor Playground →
          </button>
        </div>
        {!showAnswer && (
          <div class="question">
            What is the shortcut for {this.renderCommand(current.title, current.command)}?
          </div>
        )}
        {this.renderFeedback()}
        {showAnswer && this.renderKeyboardHint(current.title, current.command)}
        <div class="flex-spacer"></div>
        <div class="footer">
          <button class="keyboard-key" onClick={() => this.quit()}>
            Quit
          </button>
          {!showAnswer ? (
            <button
              class="keyboard-key"
              onClick={() => this.handleShowAnswer()}
              disabled={showAnswer}
            >
              Give Up (Show Answer)
            </button>
          ) : (
            <button class="keyboard-key" onClick={() => this.handleNext()}>
              Next Question (Ctrl+Enter)
            </button>
          )}
        </div>
      </div>
    );
  }
}

// Render the app
render(h(ShortcutQuiz, {}), document.getElementById('app')!);
