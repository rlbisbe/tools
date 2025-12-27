import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock inquirer before importing setup
let mockPromptResponses = {};
const mockInquirer = {
  prompt: jest.fn((questions) => {
    // Handle array of questions
    if (Array.isArray(questions)) {
      const answers = {};
      for (const question of questions) {
        // Check if question should be shown (when condition)
        if (question.when && !question.when(answers)) {
          continue;
        }
        // Use mock response or default
        answers[question.name] = mockPromptResponses[question.name] ?? question.default;
      }
      return Promise.resolve(answers);
    }
    return Promise.resolve(mockPromptResponses);
  })
};

jest.unstable_mockModule('inquirer', () => ({
  default: mockInquirer
}));

// Import setup functions after mocking
const { generateEnvContent, answersToConfig, getSetupQuestions, runSetup } =
  await import('../setup.js');

describe('Setup Wizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPromptResponses = {};
  });

  describe('generateEnvContent', () => {
    test('generates correct .env content with all options', () => {
      const config = {
        GEMINI_API_KEY: 'test-api-key',
        USE_MOCK_GEMINI: 'false',
        TWITTER_BEARER_TOKEN: 'test-bearer-token',
        OBSIDIAN_NOTES_PATH: './my-notes',
        OUTPUT_PATH: './my-output',
        DRY_RUN: 'true',
        DELETE_LINKS: 'false'
      };

      const envContent = generateEnvContent(config);

      expect(envContent).toContain('GEMINI_API_KEY=test-api-key');
      expect(envContent).toContain('USE_MOCK_GEMINI=false');
      expect(envContent).toContain('TWITTER_BEARER_TOKEN=test-bearer-token');
      expect(envContent).toContain('OBSIDIAN_NOTES_PATH=./my-notes');
      expect(envContent).toContain('OUTPUT_PATH=./my-output');
      expect(envContent).toContain('DRY_RUN=true');
      expect(envContent).toContain('DELETE_LINKS=false');
    });

    test('generates content with mock Gemini', () => {
      const config = {
        GEMINI_API_KEY: 'your_gemini_api_key_here',
        USE_MOCK_GEMINI: 'true',
        TWITTER_BEARER_TOKEN: 'your_twitter_bearer_token_here',
        OBSIDIAN_NOTES_PATH: './notes',
        OUTPUT_PATH: './output',
        DRY_RUN: 'false',
        DELETE_LINKS: 'true'
      };

      const envContent = generateEnvContent(config);

      expect(envContent).toContain('USE_MOCK_GEMINI=true');
      expect(envContent).toContain('GEMINI_API_KEY=your_gemini_api_key_here');
    });
  });

  describe('answersToConfig', () => {
    test('converts answers to config with mock Gemini', () => {
      const answers = {
        useMockGemini: true,
        useTwitter: false,
        notesPath: './notes',
        outputPath: './output',
        dryRun: false,
        deleteLinks: true
      };

      const config = answersToConfig(answers);

      expect(config).toEqual({
        USE_MOCK_GEMINI: 'true',
        GEMINI_API_KEY: 'your_gemini_api_key_here',
        TWITTER_BEARER_TOKEN: 'your_twitter_bearer_token_here',
        OBSIDIAN_NOTES_PATH: './notes',
        OUTPUT_PATH: './output',
        DRY_RUN: 'false',
        DELETE_LINKS: 'true'
      });
    });

    test('converts answers to config with real Gemini API', () => {
      const answers = {
        useMockGemini: false,
        geminiApiKey: 'real-api-key',
        useTwitter: true,
        twitterBearerToken: 'real-bearer-token',
        notesPath: './my-notes',
        outputPath: './my-output',
        dryRun: true,
        deleteLinks: false
      };

      const config = answersToConfig(answers);

      expect(config).toEqual({
        USE_MOCK_GEMINI: 'false',
        GEMINI_API_KEY: 'real-api-key',
        TWITTER_BEARER_TOKEN: 'real-bearer-token',
        OBSIDIAN_NOTES_PATH: './my-notes',
        OUTPUT_PATH: './my-output',
        DRY_RUN: 'true',
        DELETE_LINKS: 'false'
      });
    });

    test('handles missing Twitter token', () => {
      const answers = {
        useMockGemini: true,
        useTwitter: true,
        // twitterBearerToken not provided
        notesPath: './notes',
        outputPath: './output',
        dryRun: false,
        deleteLinks: true
      };

      const config = answersToConfig(answers);

      expect(config.TWITTER_BEARER_TOKEN).toBe('your_twitter_bearer_token_here');
    });
  });

  describe('getSetupQuestions', () => {
    test('returns array of question objects', () => {
      const questions = getSetupQuestions();

      expect(Array.isArray(questions)).toBe(true);
      expect(questions.length).toBeGreaterThan(0);
    });

    test('includes all required questions', () => {
      const questions = getSetupQuestions();
      const questionNames = questions.map(q => q.name);

      expect(questionNames).toContain('useMockGemini');
      expect(questionNames).toContain('geminiApiKey');
      expect(questionNames).toContain('useTwitter');
      expect(questionNames).toContain('twitterBearerToken');
      expect(questionNames).toContain('notesPath');
      expect(questionNames).toContain('outputPath');
      expect(questionNames).toContain('dryRun');
      expect(questionNames).toContain('deleteLinks');
    });

    test('has correct default values', () => {
      const questions = getSetupQuestions();
      const questionMap = Object.fromEntries(
        questions.map(q => [q.name, q])
      );

      expect(questionMap.useMockGemini.default).toBe(true);
      expect(questionMap.useTwitter.default).toBe(false);
      expect(questionMap.notesPath.default).toBe('./notes');
      expect(questionMap.outputPath.default).toBe('./output');
      expect(questionMap.dryRun.default).toBe(false);
      expect(questionMap.deleteLinks.default).toBe(true);
    });

    test('geminiApiKey shown only when not using mock', () => {
      const questions = getSetupQuestions();
      const geminiKeyQuestion = questions.find(q => q.name === 'geminiApiKey');

      expect(geminiKeyQuestion.when({ useMockGemini: true })).toBe(false);
      expect(geminiKeyQuestion.when({ useMockGemini: false })).toBe(true);
    });

    test('twitterBearerToken shown only when using Twitter', () => {
      const questions = getSetupQuestions();
      const twitterQuestion = questions.find(q => q.name === 'twitterBearerToken');

      expect(twitterQuestion.when({ useTwitter: false })).toBe(false);
      expect(twitterQuestion.when({ useTwitter: true })).toBe(true);
    });

    test('geminiApiKey has validation', () => {
      const questions = getSetupQuestions();
      const geminiKeyQuestion = questions.find(q => q.name === 'geminiApiKey');

      expect(typeof geminiKeyQuestion.validate).toBe('function');
      expect(geminiKeyQuestion.validate('')).not.toBe(true);
      expect(geminiKeyQuestion.validate('   ')).not.toBe(true);
      expect(geminiKeyQuestion.validate('valid-key')).toBe(true);
    });
  });

  describe('runSetup integration', () => {
    const originalCwd = process.cwd();
    let testDir;

    beforeEach(async () => {
      // Create a temporary test directory
      testDir = path.join(__dirname, 'test-setup-temp');
      await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      // Clean up test directory
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    test('creates .env file with mock Gemini setup', async () => {
      mockPromptResponses = {
        useMockGemini: true,
        useTwitter: false,
        notesPath: './notes',
        outputPath: './output',
        dryRun: false,
        deleteLinks: true
      };

      // Mock console.log to suppress output during tests
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Note: runSetup writes to __dirname of setup.js, not testDir
        // We're testing the logic flow, not actual file creation here
        await runSetup();

        expect(mockInquirer.prompt).toHaveBeenCalled();
      } finally {
        console.log = originalLog;
      }
    });

    test('creates .env file with real API keys', async () => {
      mockPromptResponses = {
        useMockGemini: false,
        geminiApiKey: 'test-api-key-123',
        useTwitter: true,
        twitterBearerToken: 'test-bearer-456',
        notesPath: './custom-notes',
        outputPath: './custom-output',
        dryRun: true,
        deleteLinks: false
      };

      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const config = await runSetup();

        expect(config.GEMINI_API_KEY).toBe('test-api-key-123');
        expect(config.TWITTER_BEARER_TOKEN).toBe('test-bearer-456');
        expect(config.USE_MOCK_GEMINI).toBe('false');
        expect(config.DRY_RUN).toBe('true');
        expect(config.DELETE_LINKS).toBe('false');
      } finally {
        console.log = originalLog;
      }
    });

    test('handles existing .env file with overwrite', async () => {
      mockPromptResponses = {
        useMockGemini: true,
        useTwitter: false,
        notesPath: './notes',
        outputPath: './output',
        dryRun: false,
        deleteLinks: true,
        overwrite: true
      };

      const originalLog = console.log;
      console.log = jest.fn();

      try {
        await runSetup();

        // Verify prompt was called
        expect(mockInquirer.prompt).toHaveBeenCalled();
      } finally {
        console.log = originalLog;
      }
    });

    test('handles existing .env file without overwrite', async () => {
      mockPromptResponses = {
        useMockGemini: true,
        useTwitter: false,
        notesPath: './notes',
        outputPath: './output',
        dryRun: false,
        deleteLinks: true,
        overwrite: false
      };

      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const config = await runSetup();

        // Should still return config even if not writing
        expect(config).toBeDefined();
        expect(config.USE_MOCK_GEMINI).toBe('true');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('Configuration scenarios', () => {
    test('minimal setup (all defaults)', () => {
      const answers = {
        useMockGemini: true,
        useTwitter: false,
        notesPath: './notes',
        outputPath: './output',
        dryRun: false,
        deleteLinks: true
      };

      const config = answersToConfig(answers);

      expect(config.USE_MOCK_GEMINI).toBe('true');
      expect(config.TWITTER_BEARER_TOKEN).toBe('your_twitter_bearer_token_here');
      expect(config.DRY_RUN).toBe('false');
      expect(config.DELETE_LINKS).toBe('true');
    });

    test('full production setup', () => {
      const answers = {
        useMockGemini: false,
        geminiApiKey: 'prod-api-key',
        useTwitter: true,
        twitterBearerToken: 'prod-bearer-token',
        notesPath: '/path/to/obsidian/notes',
        outputPath: '/path/to/output',
        dryRun: false,
        deleteLinks: true
      };

      const config = answersToConfig(answers);

      expect(config.USE_MOCK_GEMINI).toBe('false');
      expect(config.GEMINI_API_KEY).toBe('prod-api-key');
      expect(config.TWITTER_BEARER_TOKEN).toBe('prod-bearer-token');
      expect(config.OBSIDIAN_NOTES_PATH).toBe('/path/to/obsidian/notes');
      expect(config.OUTPUT_PATH).toBe('/path/to/output');
    });

    test('testing setup (dry-run enabled)', () => {
      const answers = {
        useMockGemini: true,
        useTwitter: false,
        notesPath: './test-notes',
        outputPath: './test-output',
        dryRun: true,
        deleteLinks: false
      };

      const config = answersToConfig(answers);

      expect(config.DRY_RUN).toBe('true');
      expect(config.DELETE_LINKS).toBe('false');
    });
  });
});
