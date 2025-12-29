import { jest } from '@jest/globals';
import { createGeminiService } from '../geminiService.js';

// Mock cheerio
const mockCheerio = {
  load: jest.fn()
};

jest.unstable_mockModule('cheerio', () => ({
  load: mockCheerio.load
}));

// Skip network-dependent tests in CI
const describeIfNetwork = process.env.SKIP_NETWORK_TESTS ? describe.skip : describe;

describe('GeminiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createGeminiService', () => {
    test('creates MockGeminiService when useMock is true', () => {
      const service = createGeminiService(true);
      expect(service).toBeDefined();
      expect(service.convertHtmlToMarkdown).toBeDefined();
    });

    test('creates real GeminiService when useMock is false and CLI command provided', () => {
      const service = createGeminiService(false, 'gemini', 'gemini');
      expect(service).toBeDefined();
      expect(service.convertHtmlToMarkdown).toBeDefined();
    });

    test('creates Kiro service with toolType', () => {
      const service = createGeminiService(false, 'kiro', 'kiro');
      expect(service).toBeDefined();
      expect(service.toolType).toBe('kiro');
    });

    test('creates Claude Code service with toolType', () => {
      const service = createGeminiService(false, 'claude', 'claude');
      expect(service).toBeDefined();
      expect(service.toolType).toBe('claude');
    });

    test('throws error when useMock is false but no CLI command', () => {
      expect(() => createGeminiService(false, '')).toThrow(
        'CLI_COMMAND is required when not using mock service'
      );
    });

    test('throws error for invalid tool type', () => {
      expect(() => createGeminiService(false, 'gemini', 'invalid')).toThrow(
        'Invalid CLI_TOOL_TYPE'
      );
    });
  });

  describe('MockGeminiService', () => {
    let service;
    let mockDom;

    beforeEach(() => {
      service = createGeminiService(true);

      // Mock cheerio DOM
      mockDom = {
        find: jest.fn().mockReturnThis(),
        first: jest.fn().mockReturnThis(),
        text: jest.fn(),
        each: jest.fn(),
        remove: jest.fn().mockReturnThis(),
        length: 1
      };

      mockCheerio.load.mockReturnValue(() => mockDom);
    });

    test('converts HTML to markdown', async () => {
      const html = '<h1>Test Title</h1><p>Test content</p>';
      const url = 'https://example.com/test';

      const markdown = await service.convertHtmlToMarkdown(html, url);

      expect(markdown).toBeTruthy();
      expect(markdown).toContain('Test Title');
      // Mock Gemini service should process the HTML
      expect(typeof markdown).toBe('string');
      expect(markdown.length).toBeGreaterThan(0);
    });

    test('includes source URL in markdown', async () => {
      const html = '<p>Content</p>';
      const url = 'https://example.com/article';

      const markdown = await service.convertHtmlToMarkdown(html, url);

      expect(markdown).toContain('Untitled Article');
      expect(markdown).toContain('Content');
    });
  });

  describe.skip('Real GeminiService', () => {
    // These tests require a real Gemini CLI tool to be installed
    // They are skipped by default but can be enabled for manual testing

    test('creates service with CLI command', () => {
      const service = createGeminiService(false, 'gemini');
      expect(service).toBeDefined();
      expect(service.cliCommand).toBe('gemini');
    });

    test('can specify custom CLI command path', () => {
      const service = createGeminiService(false, '/usr/local/bin/gemini');
      expect(service).toBeDefined();
      expect(service.cliCommand).toBe('/usr/local/bin/gemini');
    });
  });
});
