import { h, render, Component, Fragment } from 'preact';
import {
  DisplayKeys,
  IncomingMessage,
  KeyMappings,
  OutgoingMessage,
  QuizShortcut,
  QuizShortcutNonRecursive,
} from './types';

declare function acquireVsCodeApi(): any;
const vscode: {
  postMessage: (message: IncomingMessage) => void;
} = acquireVsCodeApi();

let keyMappings: KeyMappings = {};
let configKeyboardLanguage: 'en' | 'de' = 'en';

interface QuizShortcutWithState extends QuizShortcut {
  currentCapturedSteps: ShortcutStep[] | null;
  currentWrongTries: number;
  lastWrongTry: KeyboardEvent | null;
  showAnswer: boolean;
  feedback: { type: string } | null;
}

interface ShortcutQuizState {
  rawShortcuts: QuizShortcut[];
  shortcuts: QuizShortcutWithState[];
  currentShortcutIndex: number;
  currentShortcut: QuizShortcutWithState | null;
  currentStepIndices: number[];
  currentPossibleSteps: ShortcutSteps[];
  currentEnabledSteps: ShortcutSteps[];
  currentRelatedShortcuts: { command: string; title: string; steps: ShortcutSteps[] }[];
  isComplete: boolean;
  isFadingOut: boolean;
  pressedKeys: { key: string | null; keyCode: string }[];
  feedbackKey: number;
  playgroundOpen: boolean;
  correctCounter: number;
  debug: boolean;
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
  maxWrongTries = 10;
  availableClips: string[] = [];
  constructor(props: {}) {
    super(props);
    this.state = {
      rawShortcuts: [],
      shortcuts: [],
      currentShortcutIndex: 0,
      currentShortcut: null,
      currentStepIndices: [],
      currentPossibleSteps: [],
      currentEnabledSteps: [],
      currentRelatedShortcuts: [],
      isComplete: false,
      isFadingOut: false,
      pressedKeys: [],
      feedbackKey: 0,
      playgroundOpen: false,
      correctCounter: 0,
      debug: false,
    };
    this.feedbackTimer = null;
    this.fadeOutTimer = null;
    this.previousFeedbackKey = 0;
  }

  componentDidMount() {
    window.addEventListener('message', this.handleMessage);
    document.addEventListener('keydown', this.handleKeydown);
    document.addEventListener('keyup', this.handleKeyup);
    fetch('https://api.github.com/repos/furnya/shortcut-quiz/contents/assets/clips')
      .then((response) => response.json())
      .then((data) => {
        this.availableClips = data.map((file: { name: string }) => file.name);
        vscode.postMessage({ command: 'ready' });
      });
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
      this.maxWrongTries = message.maxWrongTries;
      this.setState({ rawShortcuts: message.shortcuts, debug: message.debug }, () =>
        this.initializeShortcuts(),
      );
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

  initializeShortcuts = () => {
    const { rawShortcuts } = this.state;
    this.setState(
      {
        shortcuts: rawShortcuts.map((s) => ({
          ...s,
          currentCapturedSteps: null,
          currentWrongTries: 0,
          lastWrongTry: null,
          showAnswer: false,
          feedback: null,
        })),
        isComplete: false,
        correctCounter: 0,
      },
      () => {
        this.selectShortcutByIndex(0);
      },
    );
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
    const newState: Partial<ShortcutQuizState> = {
      currentShortcutIndex: index,
      currentShortcut: shortcuts[index],
      currentPossibleSteps,
      currentEnabledSteps,
      currentStepIndices: currentEnabledSteps.map((_) => 0),
      currentRelatedShortcuts: currentRelatedShortcuts,
    };
    this.setState(newState);
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
    const { pressedKeys, currentShortcut } = this.state;
    const keyPair = this.getKeyAndKeyCode(event);
    const keyIndex = pressedKeys.findIndex(
      (k) => k.key === keyPair.key && k.keyCode === keyPair.keyCode,
    );
    if (keyIndex >= 0) {
      pressedKeys.splice(keyIndex, 1);
      if (currentShortcut) {
        currentShortcut.lastWrongTry = null;
      }
      this.setState({ pressedKeys, currentShortcut }, () => {
        console.debug('Pressed keys:', structuredClone(this.state.pressedKeys));
      });
    }
  };

  handleKeydown = async (event: KeyboardEvent) => {
    console.debug('Keydown event:', event);
    event.preventDefault();
    event.stopPropagation();
    const {
      currentStepIndices,
      currentEnabledSteps,
      currentShortcut,
      pressedKeys,
      isComplete,
      currentShortcutIndex,
    } = this.state;
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

    if (isComplete) {
      if (
        event.key === 'Enter' &&
        event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        this.handleRestart();
      }
      if (
        event.key === 'w' &&
        event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        this.quit();
      }
      return;
    }

    const steps = currentEnabledSteps.map((s, i) => s.steps[currentStepIndices[i]]);
    console.debug('Steps:', steps);
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

    // If answer is already showing, don't process keypresses
    if (event.key === 'Enter' && event.ctrlKey && !event.altKey && !event.metaKey) {
      if (event.shiftKey) {
        if (
          currentShortcutIndex > 0 &&
          (!correctSteps.some((s) => s) || currentShortcut?.showAnswer)
        ) {
          this.handlePrevious();
          return;
        }
      } else {
        if (currentShortcut?.showAnswer) {
          this.handleNext();
        }
      }
    }
    if (currentShortcut?.showAnswer) {
      return;
    }

    const lastWrongTry = currentShortcut?.lastWrongTry;
    if (
      lastWrongTry &&
      event.key === lastWrongTry.key &&
      event.code === lastWrongTry.code &&
      event.ctrlKey === lastWrongTry.ctrlKey &&
      event.shiftKey === lastWrongTry.shiftKey &&
      event.altKey === lastWrongTry.altKey &&
      event.metaKey === lastWrongTry.metaKey
    ) {
      console.debug('Last wrong try matched:', lastWrongTry);
      return;
    }

    if (!steps.length) return;
    if (pressedKey && ['control', 'shift', 'alt', 'meta'].includes(pressedKey)) {
      return;
    }
    const newCurrentStep = currentStepIndices.map((s, i) => (correctSteps[i] ? s + 1 : 0));
    if (correctSteps.some((s) => s)) {
      const completedSteps = newCurrentStep.findIndex(
        (s, i) => s >= currentEnabledSteps[i].steps.length,
      );
      if (completedSteps >= 0) {
        this.handleCorrectAnswer(currentEnabledSteps[completedSteps].steps);
      } else {
        if (currentShortcut) {
          currentShortcut.feedback = { type: 'progress' };
        }
        this.setState({
          currentStepIndices: newCurrentStep,
          currentShortcut,
        });
      }
    } else {
      if (this.feedbackTimer) {
        clearTimeout(this.feedbackTimer);
      }
      if (this.fadeOutTimer) {
        clearTimeout(this.fadeOutTimer);
      }
      if (currentShortcut && currentShortcut.currentWrongTries >= this.maxWrongTries - 1) {
        this.handleShowAnswer(true);
      } else {
        // Reset on incorrect key
        if (currentShortcut) {
          currentShortcut.feedback = { type: 'incorrect' };
          currentShortcut.currentWrongTries += 1;
          currentShortcut.lastWrongTry = event;
        }
        this.setState({
          currentStepIndices: newCurrentStep,
          feedbackKey: this.state.feedbackKey + 1, // Increment key to force re-render
          currentShortcut,
        });
      }
    }
  };

  handleCorrectAnswer = (steps: ShortcutStep[]) => {
    const { shortcuts, currentShortcutIndex, correctCounter, currentShortcut } = this.state;
    const current = shortcuts[currentShortcutIndex];

    if (currentShortcut) {
      currentShortcut.showAnswer = true;
      currentShortcut.feedback = { type: 'correct' };
      currentShortcut.currentCapturedSteps = steps;
    }
    this.setState({
      correctCounter: correctCounter + 1,
      currentShortcut,
    });

    vscode.postMessage({
      command: 'shortcutAnswer',
      correct: true,
      shortcutCommand: current.command,
    });
  };

  handleShowAnswer = (fromWrongTry = false) => {
    const { currentShortcut } = this.state;
    if (!currentShortcut) return;
    currentShortcut.showAnswer = true;
    currentShortcut.feedback = fromWrongTry ? { type: 'wrongTriesExceeded' } : null;
    this.setState({ currentShortcut });

    vscode.postMessage({
      command: 'shortcutAnswer',
      correct: false,
      shortcutCommand: currentShortcut.command,
    });
  };

  handlePrevious = () => {
    const { currentShortcutIndex } = this.state;
    this.selectShortcutByIndex(currentShortcutIndex - 1);
  };

  handleNext = () => {
    const { shortcuts, currentShortcutIndex } = this.state;
    const nextIndex = currentShortcutIndex + 1;
    if (nextIndex >= shortcuts.length) {
      // Quiz complete
      this.setState({ isComplete: true });
    } else {
      this.selectShortcutByIndex(nextIndex);
    }
  };

  handleRestart = () => {
    this.initializeShortcuts();
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

  renderKeybinding(keybinding: ShortcutStep[], scaleDown = false) {
    return keybinding.map((step, stepIndex) => (
      <Fragment key={stepIndex}>
        {step.modifiers.map((key, i) => (
          <Fragment key={i}>
            <span
              className={`keyboard-key ${this.getActive(key)}`}
              style={{ transform: scaleDown ? 'scale(calc(30/35))' : 'scale(1)' }}
            >
              {key}
            </span>
            <span class="keyboard-key-connector">+</span>
          </Fragment>
        ))}
        <span
          className={`keyboard-key ${this.getActive(step.key)}`}
          style={{ transform: scaleDown ? 'scale(calc(30/35))' : 'scale(1)' }}
        >
          {step.displayKeys?.[configKeyboardLanguage] ?? step.key}
        </span>
        {stepIndex < keybinding.length - 1 && <span class="keyboard-key-connector"> then </span>}
      </Fragment>
    ));
  }

  renderKeyboardHint(currentCommand: QuizShortcut) {
    const { currentPossibleSteps, currentRelatedShortcuts } = this.state;

    if (currentPossibleSteps.length === 0) return null;

    const formatSteps = (steps: ShortcutSteps[], subCommand: string) => (
      <div class="shortcuts-table">
        <table class="grid-layout">
          <thead>
            <tr>
              <th>Key(s)</th>
              <th>Conditions</th>
              <th>Status</th>
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
                <td>
                  <span style="margin-bottom: 5px">
                    {s.enabled ? 'Enabled for Quiz' : 'Disabled for Quiz'}
                  </span>
                  {s.disablingPossible && (
                    <button
                      disabled={s.enabled && steps.filter((x) => x.enabled).length <= 1}
                      title={
                        s.enabled && steps.filter((x) => x.enabled).length <= 1
                          ? 'At least one shortcut must be enabled'
                          : undefined
                      }
                      class="keyboard-key disable-button"
                      onClick={() => this.sendUpdateKeybindingMessage(subCommand, !s.enabled, s)}
                    >
                      {s.enabled ? 'Disable' : 'Enable'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

    return (
      <div class="answer">
        Answer:
        {formatSteps(currentPossibleSteps, currentCommand.command)}
        {currentRelatedShortcuts.length > 0 && (
          <details open class="related-shortcuts">
            <summary>
              Related Shortcuts
              <hr />
            </summary>
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

  sendUpdateKeybindingMessage(command: string, enable: boolean, steps?: ShortcutSteps) {
    const {
      currentPossibleSteps,
      currentRelatedShortcuts,
      shortcuts,
      currentShortcut,
      rawShortcuts,
    } = this.state;
    vscode.postMessage({
      command: 'updateKeybinding',
      key: steps ? steps.rawKeys : undefined,
      enable,
      shortcutCommand: command,
    });
    if (steps) {
      steps.enabled = !steps.enabled;
      if (currentShortcut) {
        const sourceKey = currentShortcut.keys.find((k) => k.key === steps.rawKeys);
        if (sourceKey) {
          sourceKey.enabled = steps.enabled;
        }
      }
    } else {
      if (currentShortcut) {
        currentShortcut.enabled = !currentShortcut.enabled;
        const rawShortcut = rawShortcuts.find((s) => s.command === command);
        if (rawShortcut) {
          rawShortcut.enabled = !rawShortcut.enabled;
        }
      }
    }
    this.setState({
      currentPossibleSteps,
      currentRelatedShortcuts,
      shortcuts,
      currentShortcut,
      rawShortcuts,
    });
  }

  handleVideoClick(e: h.JSX.TargetedMouseEvent<HTMLVideoElement>): void {
    e.preventDefault();
    if (e.currentTarget.paused) {
      e.currentTarget.play();
    } else {
      e.currentTarget.pause();
    }
  }

  renderFeedback = () => {
    const { currentShortcut, feedbackKey } = this.state;

    const { feedback, currentCapturedSteps } = currentShortcut || {};
    if (!feedback) return <div></div>;

    const feedbackText = {
      correct: 'Correct!',
      incorrect: 'Incorrect key, try again!',
      progress: 'Keep going...',
      wrongTriesExceeded: `You've pressed the wrong key ${this.maxWrongTries} times!`,
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
            You pressed: {this.renderKeybinding(currentCapturedSteps ?? [], true)}
          </span>
        )}
      </div>
    );
  };

  render() {
    const { shortcuts, currentShortcutIndex, currentShortcut, isComplete, playgroundOpen, debug } =
      this.state;

    if (shortcuts.length === 0 || !currentShortcut) {
      return <div>Loading...</div>;
    }

    if (isComplete) {
      return (
        <div class="completion">
          <h2>Quiz Complete!</h2>
          <p>You've finished the keyboard shortcuts quiz.</p>
          <p>
            You've answered {this.state.correctCounter} out of {shortcuts.length} questions
            correctly.
          </p>
          <button class="keyboard-key" onClick={this.handleRestart}>
            Start Over (Ctrl+Enter)
          </button>
          <br />
          <br />
          <button class="keyboard-key" onClick={this.quit}>
            Quit (Ctrl+W)
          </button>
        </div>
      );
    }

    return (
      <div class="app-main">
        <div class="question-counter">
          Question {currentShortcutIndex + 1}/{shortcuts.length}
        </div>
        <div class="header">
          <div>
            <button
              class="keyboard-key"
              onClick={() => this.handlePrevious()}
              disabled={currentShortcutIndex === 0}
            >
              Previous Question (Ctrl+Shift+Enter)
            </button>
          </div>
          <div>
            <button
              class="keyboard-key"
              onClick={() => this.handleShowAnswer()}
              disabled={currentShortcut.showAnswer}
            >
              Show Answer
            </button>
          </div>
          <div>
            <button
              class="keyboard-key"
              onClick={() => this.handleNext()}
              disabled={!debug && !currentShortcut.showAnswer}
            >
              {currentShortcutIndex < shortcuts.length - 1
                ? 'Next Question (Ctrl+Enter)'
                : 'Show result (Ctrl+Enter)'}
            </button>
          </div>
        </div>
        {currentShortcut.feedback && <div class="progress-container">{this.renderFeedback()}</div>}
        <div class={`question-container ${currentShortcut.showAnswer ? 'answer-shown' : ''} ${this.availableClips.includes(`${currentShortcut.command}.mp4`) ? 'video-shown' : ''}`}>
          <div class="question">
            What is the shortcut for{' '}
            {this.renderCommand(currentShortcut.title, currentShortcut.command)}?
          </div>
          {currentShortcut.command &&
            this.availableClips.includes(`${currentShortcut.command}.mp4`) && (
              <details open class="video-details">
                <summary>Video</summary>
                <video
                  controls
                  autoplay
                  loop
                  muted
                  key={currentShortcut.command}
                  onClick={(e) => this.handleVideoClick(e)}
                >
                  <source
                    src={`https://github.com/furnya/shortcut-quiz/raw/refs/heads/main/assets/clips/${currentShortcut.command}.mp4`}
                    type="video/mp4"
                  />
                  No video available for this shortcut.
                </video>
              </details>
            )}
        </div>
        {currentShortcut.showAnswer && this.renderKeyboardHint(currentShortcut)}
        <div class="flex-spacer"></div>
        <div class="footer">
          <div>
            <button class="keyboard-key" onClick={() => this.quit()}>
              Quit
            </button>
            <button class="keyboard-key" onClick={() => this.handleRestart()}>
              Restart
            </button>
          </div>
          <button
            class="keyboard-key"
            onClick={() =>
              this.sendUpdateKeybindingMessage(currentShortcut.command, !currentShortcut.enabled)
            }
          >
            {currentShortcut.enabled ? 'Disable' : 'Enable'} this shortcut for future quizzes
          </button>
          <button class="keyboard-key" onClick={() => this.sendPlaygroundMessage(playgroundOpen)}>
            {playgroundOpen ? 'Close' : 'Open'} Editor Playground →
          </button>
        </div>
      </div>
    );
  }
}

// Render the app
render(h(ShortcutQuiz, {}), document.getElementById('app')!);
