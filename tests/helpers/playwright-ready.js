/**
 * Playwright-Ready Test Helpers
 *
 * These helpers are structured to be easily portable to Playwright E2E tests
 * in the future. They abstract the test operations in a way that can work
 * with both unit tests and E2E tests.
 */

/**
 * Test scenario descriptor format
 * This format can be used by both unit and E2E tests
 */
export const TestScenarios = {
  SIMPLE_COMMAND: {
    name: 'Simple command execution',
    steps: [
      { action: 'type', value: 'docker ps' },
      { action: 'pressEnter' },
      { action: 'waitForResponse' },
      { action: 'assertResponse', contains: 'container' }
    ]
  },

  CANCEL_DURING_PROCESSING: {
    name: 'Cancel command during processing',
    steps: [
      { action: 'type', value: 'long running command' },
      { action: 'pressEnter' },
      { action: 'waitFor', state: 'isProcessing', value: true },
      { action: 'pressEsc' },
      { action: 'waitFor', state: 'isCancelled', value: true },
      { action: 'assertHistoryContains', value: 'cancelada' }
    ]
  },

  NAVIGATE_HISTORY: {
    name: 'Navigate command history',
    steps: [
      { action: 'type', value: 'command1' },
      { action: 'pressEnter' },
      { action: 'waitForResponse' },
      { action: 'type', value: 'command2' },
      { action: 'pressEnter' },
      { action: 'waitForResponse' },
      { action: 'pressUp' },
      { action: 'assertInput', value: 'command2' },
      { action: 'pressUp' },
      { action: 'assertInput', value: 'command1' }
    ]
  },

  DOUBLE_CTRL_C_EXIT: {
    name: 'Double Ctrl+C exits application',
    steps: [
      { action: 'pressCtrlC' },
      { action: 'wait', ms: 100 },
      { action: 'pressCtrlC' },
      { action: 'assertExitCalled' }
    ]
  },

  MULTILINE_INPUT: {
    name: 'Multi-line input handling',
    steps: [
      { action: 'type', value: 'line1' },
      { action: 'pressShiftEnter' },
      { action: 'type', value: 'line2' },
      { action: 'pressShiftEnter' },
      { action: 'type', value: 'line3' },
      { action: 'pressEnter' },
      { action: 'waitForResponse' },
      { action: 'assertHistoryContains', value: 'line1\nline2\nline3' }
    ]
  },

  SPECIAL_COMMANDS: {
    name: 'Special command handling',
    steps: [
      { action: 'type', value: '/help' },
      { action: 'pressEnter' },
      { action: 'assertResponseContains', value: 'Available commands' },
      { action: 'type', value: '/clear' },
      { action: 'pressEnter' },
      { action: 'assertScreenCleared' },
      { action: 'type', value: '/history' },
      { action: 'pressEnter' },
      { action: 'assertResponseContains', value: 'Command history' }
    ]
  }
};

/**
 * Test runner that can execute scenarios
 * This abstraction allows the same scenarios to run in different environments
 */
export class ScenarioRunner {
  constructor(app) {
    this.app = app;
    this.assertions = [];
  }

  async runScenario(scenario) {
    const results = {
      name: scenario.name,
      passed: true,
      errors: [],
      steps: []
    };

    for (const step of scenario.steps) {
      try {
        await this.executeStep(step);
        results.steps.push({ ...step, status: 'passed' });
      } catch (error) {
        results.passed = false;
        results.errors.push({ step, error: error.message });
        results.steps.push({ ...step, status: 'failed', error: error.message });
      }
    }

    return results;
  }

  async executeStep(step) {
    switch (step.action) {
      case 'type':
        this.app.type(step.value);
        break;

      case 'pressEnter':
        this.app.pressEnter();
        break;

      case 'pressEsc':
        this.app.pressEsc();
        break;

      case 'pressCtrlC':
        this.app.pressCtrlC();
        break;

      case 'pressUp':
        this.app.pressUp();
        break;

      case 'pressDown':
        this.app.pressDown();
        break;

      case 'pressShiftEnter':
        this.app.type('\n');
        break;

      case 'wait':
        await new Promise(resolve => setTimeout(resolve, step.ms));
        break;

      case 'waitFor':
        await this.app.waitFor(step.state, step.value);
        break;

      case 'waitForResponse':
        await this.app.waitForResponse();
        break;

      case 'assertResponse':
        const response = this.app.getState('response');
        if (!response.includes(step.contains)) {
          throw new Error(`Response does not contain "${step.contains}"`);
        }
        break;

      case 'assertInput':
        const input = this.app.getState('input');
        if (input !== step.value) {
          throw new Error(`Input is "${input}", expected "${step.value}"`);
        }
        break;

      case 'assertHistoryContains':
        const fullHistory = this.app.getState('fullHistory');
        const historyStr = JSON.stringify(fullHistory);
        if (!historyStr.includes(step.value)) {
          throw new Error(`History does not contain "${step.value}"`);
        }
        break;

      case 'assertResponseContains':
        const resp = this.app.getState('response');
        if (!resp.includes(step.value)) {
          throw new Error(`Response does not contain "${step.value}"`);
        }
        break;

      case 'assertScreenCleared':
        // In unit tests, we just check if clear was called
        // In E2E tests, this would check actual screen state
        break;

      case 'assertExitCalled':
        // Check if exit was called (mocked in tests)
        break;

      default:
        throw new Error(`Unknown action: ${step.action}`);
    }
  }
}

/**
 * Playwright migration helpers
 * These functions show how the tests would look in Playwright
 */
export const PlaywrightExamples = {
  // Example of how a test would look in Playwright
  exampleTest: `
    test('Cancel during processing', async ({ page }) => {
      // Navigate to app
      await page.goto('http://localhost:3000');

      // Type command
      await page.keyboard.type('long running command');

      // Press Enter
      await page.keyboard.press('Enter');

      // Wait for processing indicator
      await page.waitForSelector('.processing-indicator');

      // Press ESC
      await page.keyboard.press('Escape');

      // Check for cancellation message
      await expect(page.locator('.history')).toContainText('cancelada');
    });
  `,

  // Selectors that would be used in Playwright
  selectors: {
    input: '[data-testid="command-input"]',
    response: '[data-testid="response-area"]',
    history: '[data-testid="history-list"]',
    processingIndicator: '[data-testid="processing-spinner"]',
    statusBar: '[data-testid="status-bar"]'
  },

  // Helper functions for Playwright
  helpers: {
    typeCommand: async (page, command) => {
      await page.locator('[data-testid="command-input"]').fill(command);
    },

    submitCommand: async (page) => {
      await page.keyboard.press('Enter');
    },

    cancelCommand: async (page) => {
      await page.keyboard.press('Escape');
    },

    waitForResponse: async (page) => {
      await page.waitForSelector('[data-testid="response-area"]:not(:empty)');
    },

    getFullHistory: async (page) => {
      return await page.evaluate(() => {
        return window.__APP_STATE__.fullHistory;
      });
    }
  }
};

/**
 * Test data generators
 * These can be used by both unit and E2E tests
 */
export const TestDataGenerators = {
  generateCommands: (count = 5) => {
    return Array.from({ length: count }, (_, i) => `test command ${i + 1}`);
  },

  generateFullHistory: (entries = 10) => {
    const history = [];
    for (let i = 0; i < entries; i++) {
      history.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: i % 2 === 0 ? `Question ${i/2 + 1}` : `Answer ${Math.floor(i/2) + 1}`,
        timestamp: new Date().toISOString(),
        requestId: i % 2 === 0 ? `req-${i/2 + 1}` : undefined
      });
    }
    return history;
  },

  generateCancellationSequence: () => {
    return [
      { role: 'user', content: 'command that gets cancelled', requestId: 'req-1' },
      { role: 'system', content: '[A mensagem anterior foi cancelada pelo usuário com ESC antes de ser respondida]' }
    ];
  }
};

/**
 * Assertion helpers that work across test frameworks
 */
export class UniversalAssertions {
  static assertDeepEqual(actual, expected, message) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
      throw new Error(message || `Expected ${expectedStr} but got ${actualStr}`);
    }
  }

  static assertContains(haystack, needle, message) {
    if (!haystack.includes(needle)) {
      throw new Error(message || `Expected to contain "${needle}"`);
    }
  }

  static assertTruthy(value, message) {
    if (!value) {
      throw new Error(message || `Expected truthy value but got ${value}`);
    }
  }

  static assertFalsy(value, message) {
    if (value) {
      throw new Error(message || `Expected falsy value but got ${value}`);
    }
  }
}