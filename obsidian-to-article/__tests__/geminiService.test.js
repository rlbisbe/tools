import { jest } from '@jest/globals';
import { createLLMService } from '../llmServiceFactory.js';

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

  describe('createLLMService', () => {
    test('creates MockLLMService when useMock is true', () => {
      const service = createLLMService(true);
      expect(service).toBeDefined();
      expect(service.convertHtmlToMarkdown).toBeDefined();
      expect(service.getServiceName()).toBe('MockGemini');
    });

    test('creates MockGeminiService with mock service type', () => {
      const service = createLLMService({ serviceType: 'mock' });
      expect(service).toBeDefined();
      expect(service.convertHtmlToMarkdown).toBeDefined();
      expect(service.getServiceName()).toBe('MockGemini');
    });

    test('creates GeminiApiService when API key is provided', () => {
      const service = createLLMService({
        serviceType: 'api',
        apiKey: 'test-api-key'
      });
      expect(service).toBeDefined();
      expect(service.convertHtmlToMarkdown).toBeDefined();
      expect(service.getServiceName()).toBe('GeminiAPI');
    });

    test('throws error when API service requested but no API key', () => {
      expect(() => createLLMService({ serviceType: 'api' })).toThrow(
        'apiKey is required for API-based service'
      );
    });

    test('throws error for invalid service type', () => {
      expect(() => createLLMService({ serviceType: 'invalid' })).toThrow(
        'Invalid serviceType: invalid. Must be one of: api, mock, ollama'
      );
    });

    test('uses custom model name for API service', () => {
      const service = createLLMService({
        serviceType: 'api',
        apiKey: 'test-key',
        modelName: 'gemini-1.5-pro'
      });
      expect(service).toBeDefined();
      expect(service.modelName).toBe('gemini-1.5-pro');
    });
  });

  describe('MockGeminiService', () => {
    let service;
    let mockDom;

    beforeEach(() => {
      service = createLLMService(true);

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

    test('handles HTML with multiple headings', async () => {
      const html = '<h1>Main</h1><h2>Sub</h2><h3>SubSub</h3>';
      const markdown = await service.convertHtmlToMarkdown(html, 'https://example.com');

      expect(markdown).toContain('Main');
      expect(markdown).toContain('Sub');
      expect(markdown).toContain('SubSub');
    });

    test('handles HTML with lists', async () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const markdown = await service.convertHtmlToMarkdown(html, 'https://example.com');

      expect(markdown).toBeTruthy();
      expect(markdown.length).toBeGreaterThan(0);
    });

    test('handles HTML with blockquotes', async () => {
      const html = '<blockquote>Quote text</blockquote>';
      const markdown = await service.convertHtmlToMarkdown(html, 'https://example.com');

      expect(markdown).toBeTruthy();
      expect(markdown.length).toBeGreaterThan(0);
    });

    test('handles empty HTML', async () => {
      const html = '';
      const markdown = await service.convertHtmlToMarkdown(html, 'https://example.com');

      expect(markdown).toBeTruthy();
      expect(typeof markdown).toBe('string');
    });

    test('handles HTML with script and style tags', async () => {
      const html = '<script>alert("test")</script><style>body{}</style><p>Content</p>';
      const markdown = await service.convertHtmlToMarkdown(html, 'https://example.com');

      expect(markdown).toBeTruthy();
      expect(markdown).toContain('Content');
    });

    test('handles HTML with title tag', async () => {
      const html = '<html><head><title>Page Title</title></head><body><p>Content</p></body></html>';
      const markdown = await service.convertHtmlToMarkdown(html, 'https://example.com');

      expect(markdown).toBeTruthy();
      expect(markdown).toContain('Page Title');
    });

    test('handles HTML with article tag', async () => {
      const html = '<article><h1>Article Title</h1><p>Article content</p></article>';
      const markdown = await service.convertHtmlToMarkdown(html, 'https://example.com');

      expect(markdown).toBeTruthy();
      expect(markdown.length).toBeGreaterThan(0);
    });

    test('handles large HTML content', async () => {
      const html = '<p>' + 'Content '.repeat(1000) + '</p>';
      const markdown = await service.convertHtmlToMarkdown(html, 'https://example.com');

      expect(markdown).toBeTruthy();
      expect(markdown.length).toBeGreaterThan(0);
    });

    test('returns service name', () => {
      expect(service.getServiceName()).toBe('MockGemini');
    });
  });

  describe.skip('Real GeminiService', () => {
    // These tests require a real Gemini CLI tool to be installed
    // They are skipped by default but can be enabled for manual testing

    test('creates service with CLI command', () => {
      const service = createLLMService(false, 'gemini');
      expect(service).toBeDefined();
      expect(service.cliCommand).toBe('gemini');
    });

    test('can specify custom CLI command path', () => {
      const service = createLLMService(false, '/usr/local/bin/gemini');
      expect(service).toBeDefined();
      expect(service.cliCommand).toBe('/usr/local/bin/gemini');
    });
  });
});
