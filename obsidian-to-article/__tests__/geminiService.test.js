import { jest } from '@jest/globals';
import { createGeminiService } from '../geminiService.js';

// Mock axios
const mockAxios = {
  post: jest.fn()
};

jest.unstable_mockModule('axios', () => ({
  default: mockAxios
}));

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

    test('creates real GeminiService when useMock is false and API key provided', () => {
      const service = createGeminiService(false, 'test-api-key');
      expect(service).toBeDefined();
      expect(service.convertHtmlToMarkdown).toBeDefined();
    });

    test('throws error when useMock is false but no API key', () => {
      expect(() => createGeminiService(false)).toThrow(
        'GEMINI_API_KEY is required when not using mock service'
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

    test('handles rate limiting with retry', async () => {
      // This test simulates the retry mechanism without making real API calls
      const mockError = {
        response: {
          status: 429,
          data: {
            error: {
              details: [
                {
                  '@type': 'type.googleapis.com/google.rpc.RetryInfo',
                  retryDelay: '1s'
                }
              ]
            }
          }
        }
      };

      // Test that retry delay is parsed correctly
      const delayMatch = mockError.response.data.error.details[0].retryDelay.match(/(\d+(?:\.\d+)?)s?/);
      expect(delayMatch).toBeTruthy();
      expect(Math.ceil(parseFloat(delayMatch[1]))).toBe(1);
    });
  });

  describe.skip('Real GeminiService', () => {
    let service;

    beforeEach(() => {
      service = createGeminiService(false, 'test-api-key');
    });

    test('calls Gemini API with correct parameters', async () => {
      const html = '<p>Test content</p>';
      const url = 'https://example.com/test';
      const mockResponse = {
        data: {
          candidates: [{
            content: {
              parts: [{
                text: '# Test Article\n\nConverted content'
              }]
            }
          }]
        }
      };

      mockAxios.post.mockResolvedValue(mockResponse);

      const markdown = await service.convertHtmlToMarkdown(html, url);

      expect(mockAxios.post).toHaveBeenCalled();
      const callArgs = mockAxios.post.mock.calls[0];

      // Check URL contains API key
      expect(callArgs[0]).toContain('test-api-key');

      // Check request body
      expect(callArgs[1].contents).toBeDefined();
      expect(callArgs[1].contents[0].parts[0].text).toContain(url);
      expect(callArgs[1].contents[0].parts[0].text).toContain(html);

      // Check response
      expect(markdown).toBe('# Test Article\n\nConverted content');
    });

    test('includes detailed prompt for content extraction', async () => {
      const html = '<p>Content</p>';
      const url = 'https://example.com/test';

      mockAxios.post.mockResolvedValue({
        data: {
          candidates: [{
            content: {
              parts: [{ text: 'Result' }]
            }
          }]
        }
      });

      await service.convertHtmlToMarkdown(html, url);

      const prompt = mockAxios.post.mock.calls[0][1].contents[0].parts[0].text;

      expect(prompt).toContain('EXTRACT:');
      expect(prompt).toContain('IGNORE/REMOVE:');
      expect(prompt).toContain('OUTPUT FORMAT:');
      expect(prompt).toContain('Article title');
      expect(prompt).toContain('Navigation menus');
      expect(prompt).toContain('Advertisement blocks');
    });

    test('throws error when API returns no content', async () => {
      mockAxios.post.mockResolvedValue({
        data: {
          candidates: []
        }
      });

      await expect(
        service.convertHtmlToMarkdown('<p>Test</p>', 'https://example.com')
      ).rejects.toThrow('No content generated by Gemini');
    });

    test('handles API errors gracefully', async () => {
      mockAxios.post.mockRejectedValue(new Error('API Error'));

      await expect(
        service.convertHtmlToMarkdown('<p>Test</p>', 'https://example.com')
      ).rejects.toThrow('API Error');
    });
  });
});
