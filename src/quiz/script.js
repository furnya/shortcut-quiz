import { h, render, Component } from 'https://esm.sh/preact';
import htm from 'https://esm.sh/htm';

const html = htm.bind(h);
const vscode = acquireVsCodeApi();

// Store state in vscode state storage
// const previousState = vscode.getState() || { scores: {} };
let keyMappings = {};
let configKeyboardLanguage = 'en';

class ShortcutQuiz extends Component {
  constructor(props) {
    super(props);
    this.state = {
      shortcuts: [],
      currentIndex: 0,
      currentStep: [],
      currentSteps: [],
      showAnswer: false,
      feedback: null,
      isComplete: false,
      isFadingOut: false,
      pressedKeys: [],
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

  handleMessage = (event) => {
    const message = event.data;
    if (message.command === 'setShortcuts') {
      configKeyboardLanguage = message.configKeyboardLanguage || 'en';
      keyMappings = message.keyMappings || {};
      console.log('Received shortcuts', message.shortcuts);
      this.initializeShortcuts(message.shortcuts);
      window.focus();
    }
  };

  translateVSCodeKey = (vsCodeKey) => {
    const key = vsCodeKey.toLowerCase();
    return (keyMappings[key]?.keyCode || vsCodeKey).toLowerCase();
  };

  initializeShortcuts = (shortcuts) => {
    if (!shortcuts || !shortcuts.length) return;

    const currentSteps = this.getStepsFromShortcuts(shortcuts[0]);

    console.log('Current steps:', currentSteps);
    this.setState({
      shortcuts,
      currentSteps,
      currentStep: currentSteps.map((_) => 0),
    });
  };

  getStepsFromShortcuts = (shortcut) => {
    if (!shortcut || !shortcut.keys.length) return [];

    const steps = [];
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

  getKeyAndKeyCode(event) {
    let key = event.key.toLowerCase();
    let keyCode = event.code.toLowerCase();
    if (keyCode.startsWith('key') && !/[a-z]/.test(key)) {
      keyCode = keyCode.replace('key', '');
    }
    if (keyCode.startsWith('numpad')) {
      key = null;
    }
    return { key, keyCode };
  }

  handleKeyup = (event) => {
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

  handleKeydown = async (event) => {
    console.debug('Keydown event:', event);
    const { currentStep, currentSteps, showAnswer, pressedKeys } = this.state;
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
        event.preventDefault();
        event.stopPropagation();
        this.handleNext();
      }
      return;
    }

    const steps = currentSteps.map((s, i) => s[currentStep[i]]);
    console.debug('Steps:', steps);
    if (!steps.length) return;
    if (['control', 'shift', 'alt', 'meta'].includes(pressedKey)) {
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
    const newCurrentStep = currentStep.map((s, i) => (correctSteps[i] ? s + 1 : 0));
    if (correctSteps.some((s) => s)) {
      event.preventDefault();
      event.stopPropagation();
      if (newCurrentStep.some((s, i) => s >= currentSteps[i].length)) {
        // Correct sequence completed
        this.handleCorrectAnswer();
      } else {
        // Move to next step in the sequence
        this.setState({
          currentStep: newCurrentStep,
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
        currentStep: newCurrentStep,
        feedback: { type: 'incorrect', text: 'Incorrect key, try again' },
        feedbackKey: this.state.feedbackKey + 1, // Increment key to force re-render
        // isFadingOut: false,
      });
    }
  };

  handleCorrectAnswer = () => {
    // const { shortcuts, currentIndex, scores } = this.state;
    const { shortcuts, currentIndex } = this.state;
    const current = shortcuts[currentIndex];

    // Update score for this shortcut
    // const updatedScores = { ...scores };
    // updatedScores[current.command] = (updatedScores[current.command] || 0) + 1;

    this.setState({
      showAnswer: true,
      feedback: { type: 'correct', text: 'Correct! Well done.' },
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
    const { shortcuts, currentIndex, scores } = this.state;
    const current = shortcuts[currentIndex];

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
    const { shortcuts, currentIndex } = this.state;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= shortcuts.length) {
      // Quiz complete
      this.setState({ isComplete: true });
      return;
    }

    const nextSteps = this.getStepsFromShortcuts(shortcuts[nextIndex]);

    this.setState({
      currentIndex: nextIndex,
      currentSteps: nextSteps,
      currentStep: nextSteps.map((_) => 0),
      showAnswer: false,
      feedback: null,
    });
  };

  handleRestart = () => {
    const { shortcuts } = this.state;
    const firstSteps = this.getStepsFromShortcuts(shortcuts[0]);

    this.setState({
      currentIndex: 0,
      currentSteps: firstSteps,
      currentStep: firstSteps.map((_) => 0),
      showAnswer: false,
      feedback: null,
      isComplete: false,
    });
  };

  renderKeyboardHint = () => {
    const { currentSteps, pressedKeys } = this.state;

    if (!currentSteps || currentSteps.length === 0) return null;

    return html`
      <ul>
        ${currentSteps.map(
          (s) => html`
            <li>
              <div class="keyboard-hint">
                ${s.map(
                  (step, stepIndex) =>
                    html`${step.modifiers.map(
                        (key) =>
                          html`<span
                              class="keyboard-key ${pressedKeys.find(
                                (k) => k.key === key || k.keyCode === key,
                              )
                                ? 'active'
                                : ''}"
                              >${key}</span
                            >+`,
                      )}
                      <span
                        class="keyboard-key ${pressedKeys.find(
                          (k) => k.key === step.key || k.keyCode === step.key,
                        )
                          ? 'active'
                          : ''}"
                        >${step.displayKeys?.[configKeyboardLanguage] ?? step.key}</span
                      >
                      ${stepIndex < s.length - 1 ? ' then ' : ''}`,
                )}
              </div>
            </li>
          `,
        )}
      </ul>
    `;
  };

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
    const { shortcuts, currentIndex, showAnswer, isComplete } = this.state;

    if (shortcuts.length === 0) {
      return html`<div>Loading...</div>`;
    }

    if (isComplete) {
      return html`
        <div class="completion">
          <h2>Quiz Complete!</h2>
          <p>You've finished the keyboard shortcuts quiz.</p>
          <button class="keyboard-key" onClick=${this.handleRestart}>Start Over</button>
        </div>
      `;
    }

    const current = shortcuts[currentIndex];

    return html`
      <div class="progress">Question ${currentIndex + 1}/${shortcuts.length}</div>

      <div class="question">What is the shortcut for "${current.title}" (${current.command})?</div>

      ${this.renderFeedback()}
      ${showAnswer &&
      html`
        <div class="answer">
          The shortcuts for "${current.title}" are ${this.renderKeyboardHint()}
        </div>
      `}
      <div class="flex-spacer"></div>
      <div style="display: flex; justify-content: flex-end;">
        ${!showAnswer &&
        html`<button class="keyboard-key" onClick=${this.handleShowAnswer} disabled=${showAnswer}>
          Give Up (Show Answer)
        </button> `}
        ${showAnswer &&
        html`<button class="keyboard-key" onClick=${this.handleNext}>
          Next Question (Ctrl+Enter)
        </button> `}
      </div>
    `;
  }
}

// Render the app
render(h(ShortcutQuiz, {}), document.getElementById('app'));
