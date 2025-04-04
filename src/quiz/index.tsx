// import { h, render, Component } from 'https://esm.sh/preact';
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
  currentPossibleSteps: ShortcutStep[][];
  currentRelatedShortcuts: { command: string; title: string; steps: ShortcutStep[][] }[];
  showAnswer: boolean;
  isComplete: boolean;
  isFadingOut: boolean;
  pressedKeys: { key: string | null; keyCode: string }[];
  feedback: { type: string; text: string } | null;
  feedbackKey: number;
  playgroundOpen: boolean;
  correctCounter: number;
}

interface ShortcutStep {
  displayKeys: DisplayKeys;
  key: string;
  modifiers: string[];
}

class TestComponent extends Component<{}, {}> {
  render() {
    return <div></div>;
  }
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
      currentRelatedShortcuts: [],
      showAnswer: false,
      feedback: null,
      isComplete: false,
      isFadingOut: false,
      pressedKeys: [],
      feedbackKey: 0,
      playgroundOpen: false,
      correctCounter: 0,
      // scores: previousState.scores,
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
      currentStepIndices: currentPossibleSteps.map((_) => 0),
      currentRelatedShortcuts: currentRelatedShortcuts,
      feedback: null,
      showAnswer: false,
    });
  }

  getStepsFromShortcuts = (shortcut: QuizShortcutNonRecursive) => {
    if (!shortcut || !shortcut.keys.length) return [];

    const steps: ShortcutStep[][] = [];
    for (const k of shortcut.keys) {
      const step = [];
      for (const keymatch of k.split(' ')) {
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
      steps.push(step);
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
    const { currentStepIndices, currentPossibleSteps, showAnswer, pressedKeys } = this.state;
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

    const steps = currentPossibleSteps.map((s, i) => s[currentStepIndices[i]]);
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
      if (newCurrentStep.some((s, i) => s >= currentPossibleSteps[i].length)) {
        // Correct sequence completed
        this.handleCorrectAnswer();
      } else {
        // Move to next step in the sequence
        this.setState({
          currentStepIndices: newCurrentStep,
          feedback: { type: 'progress', text: 'Keep going...' },
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
        feedback: { type: 'incorrect', text: 'Incorrect key, try again' },
        feedbackKey: this.state.feedbackKey + 1, // Increment key to force re-render
        // isFadingOut: false,
      });
    }
  };

  handleCorrectAnswer = () => {
    // const { shortcuts, currentShortcutIndex, scores } = this.state;
    const { shortcuts, currentShortcutIndex, correctCounter } = this.state;
    const current = shortcuts[currentShortcutIndex];

    // Update score for this shortcut
    // const updatedScores = { ...scores };
    // updatedScores[current.command] = (updatedScores[current.command] || 0) + 1;

    this.setState({
      showAnswer: true,
      feedback: { type: 'correct', text: 'Correct! Well done.' },
      correctCounter: correctCounter + 1,
      // scores: updatedScores,
    });

    // Send message to extension
    vscode.postMessage({
      command: 'shortcutAnswer',
      correct: true,
      shortcutCommand: current.command,
    });

    // Save state to vscode storage
    // vscode.setState({ scores: updatedScores });
  };

  handleShowAnswer = () => {
    const { shortcuts, currentShortcutIndex } = this.state;
    const current = shortcuts[currentShortcutIndex];

    // Update score for this shortcut (negative)
    // const updatedScores = { ...scores };
    // updatedScores[current.command] = (updatedScores[current.command] || 0) - 1;

    this.setState({
      showAnswer: true,
      // scores: updatedScores,
    });

    // Send message to extension
    vscode.postMessage({
      command: 'shortcutAnswer',
      correct: false,
      shortcutCommand: current.command,
    });

    // Save state to vscode storage
    // vscode.setState({ scores: updatedScores });
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

  renderKeyboardHint1() {
    const { currentPossibleSteps, pressedKeys } = this.state;

    if (currentPossibleSteps.length === 0) return null;

    function getActive(key: string) {
      return pressedKeys.find((k) => k.key === key || k.keyCode === key) ? 'active' : '';
    }
    function formatModifier(key: string) {
      return html`<span class="keyboard-key ${getActive(key)}">${key}</span>+`;
    }

    function formatSteps(s: ShortcutStep[]) {
      return s.map(
        (step, stepIndex) =>
          html` ${step.modifiers.map((key) => formatModifier(key))}
            <span class="keyboard-key ${getActive(step.key)}">
              ${step.displayKeys?.[configKeyboardLanguage] ?? step.key}
            </span>
            ${stepIndex < s.length - 1 ? ' then ' : ''}`,
      );
    }

    const stepList = currentPossibleSteps.map(
      (s) => html`
        <li>
          <div class="keyboard-hint">${formatSteps(s)}</div>
        </li>
      `,
    );

    return html`
      <ul>
        ${stepList}
      </ul>
    `;
  }

  renderKeyboardHint() {
    const { currentPossibleSteps, pressedKeys, currentRelatedShortcuts } = this.state;

    if (currentPossibleSteps.length === 0) return null;

    const getActive = (key: string): string => {
      return pressedKeys.find((k) => k.key === key || k.keyCode === key) ? 'active' : '';
    };

    const formatSteps = (steps: ShortcutStep[][]) =>
      steps.map((s, index) => (
        <li key={index}>
          <div className="keyboard-hint">
            {s.map((step, stepIndex) => (
              <Fragment key={stepIndex}>
                {step.modifiers.map((key, i) => (
                  <Fragment key={i}>
                    <span className={`keyboard-key ${getActive(key)}`}>{key}</span>
                    <span>+</span>
                  </Fragment>
                ))}
                <span className={`keyboard-key ${getActive(step.key)}`}>
                  {step.displayKeys?.[configKeyboardLanguage] ?? step.key}
                </span>
                {stepIndex < s.length - 1 && ' then '}
              </Fragment>
            ))}
          </div>
        </li>
      ));

    return (
      <Fragment>
        <ul>{formatSteps(currentPossibleSteps)}</ul>
        {currentRelatedShortcuts.length > 0 && (
          <Fragment>
            <span>Related Shortcuts:</span>
            {currentRelatedShortcuts.map((r, rIndex) => (
              <div>
                <span>
                  "{r.title}" ({r.command})
                </span>
                <ul key={rIndex}>{formatSteps(r.steps)}</ul>
              </div>
            ))}
          </Fragment>
        )}
      </Fragment>
    );
  }

  renderFeedback = () => {
    const { feedback, feedbackKey } = this.state;

    if (!feedback) return null;
    // if (feedbackKey === this.previousFeedbackKey) {
    //   return null;
    // }
    // this.previousFeedbackKey = feedbackKey;

    // if (feedback.type === 'incorrect') {
    //   return html`
    //     <div key=${feedbackKey} class="feedback incorrect">${feedback.text}</div>
    //   `;
    // }
    if (feedback.type === 'incorrect') {
      return html`
        <div key=${feedbackKey} class="feedback ${feedback.type}">${feedback.text}</div>
      `;
    }
    return html` <div class="feedback ${feedback.type}">${feedback.text}</div> `;
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
        <div class="question">
          What is the shortcut for "{current.title}" ({current.command})?
        </div>
        {this.renderFeedback()}
        {showAnswer && (
          <div class="answer">
            The shortcuts for "{current.title}" are {this.renderKeyboardHint()}
          </div>
        )}
        <div class="flex-spacer"></div>
        <div style="display: flex; justify-content: space-between;">
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
