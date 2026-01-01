import { jest } from '@jest/globals';
import { OpenRouterService } from '../openrouterService.js';

// Mock fetch globally
global.fetch = jest.fn();

describe('OpenRouterService', () => {
  let service;
  const mockApiKey = 'test-api-key-123';
  const mockModel = 'openai/gpt-3.5-turbo';

  beforeEach(() => {
    service = new OpenRouterService(mockApiKey, mockModel);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('creates service with required API key', () => {
      const newService = new OpenRouterService('my-key', 'anthropic/claude-2');
      expect(newService.apiKey).toBe('my-key');
      expect(newService.model).toBe('anthropic/claude-2');
      expect(newService.baseUrl).toBe('https://openrouter.ai/api/v1');
    });

    test('creates service with default model', () => {
      const defaultService = new OpenRouterService('test-key');
      expect(defaultService.apiKey).toBe('test-key');
      expect(defaultService.model).toBe('openai/gpt-3.5-turbo');
    });

    test('throws error when API key is missing', () => {
      expect(() => new OpenRouterService()).toThrow('OPENROUTER_API_KEY is required for OpenRouterService');
      expect(() => new OpenRouterService(null)).toThrow('OPENROUTER_API_KEY is required for OpenRouterService');
      expect(() => new OpenRouterService('')).toThrow('OPENROUTER_API_KEY is required for OpenRouterService');
    });
  });

  describe('getServiceName', () => {
    test('returns correct service name', () => {
      expect(service.getServiceName()).toBe('OpenRouter');
    });
  });

  describe('convertHtmlToMarkdown', () => {
    const mockHtml = '<h1>Test Title</h1><p>Test content</p>';
    const mockUrl = 'https://example.com/test';

    beforeEach(() => {
      // Reset console.log mock
      jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      console.log.mockRestore();
    });

    test('successfully converts HTML to markdown', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: '# Test Title\n\nTest content'
            }
          }
        ]
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await service.convertHtmlToMarkdown(mockHtml, mockUrl);

      expect(result).toBe('# Test Title\n\nTest content');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${mockApiKey}`,
            'Content-Type': 'application/json'
          }
        })
      );
    });

    test('sends correct request format to OpenRouter API', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'converted text' } }]
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      await service.convertHtmlToMarkdown(mockHtml, mockUrl);

      const fetchCall = global.fetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.model).toBe(mockModel);
      expect(requestBody.messages).toHaveLength(1);
      expect(requestBody.messages[0].role).toBe('user');
      expect(requestBody.messages[0].content).toContain('Extract the main article content');
      expect(requestBody.messages[0].content).toContain(mockHtml);
    });

    test('includes correct authorization header', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'result' } }]
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      await service.convertHtmlToMarkdown(mockHtml, mockUrl);

      const fetchCall = global.fetch.mock.calls[0];
      expect(fetchCall[1].headers['Authorization']).toBe(`Bearer ${mockApiKey}`);
    });

    test('handles large HTML by truncating', async () => {
      const largeHtml = 'a'.repeat(60000);
      const mockResponse = {
        choices: [{ message: { content: 'converted' } }]
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      await service.convertHtmlToMarkdown(largeHtml, mockUrl);

      const fetchCall = global.fetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.messages[0].content).toContain('[HTML truncated - too large]');
    });

    test('throws error when OpenRouter API returns error status', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized - Invalid API key'
      });

      await expect(
        service.convertHtmlToMarkdown(mockHtml, mockUrl)
      ).rejects.toThrow('OpenRouter API error (401): Unauthorized - Invalid API key');
    });

    test('throws error when response content is empty', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '' } }]
        })
      });

      await expect(
        service.convertHtmlToMarkdown(mockHtml, mockUrl)
      ).rejects.toThrow('No content generated by OpenRouter API');
    });

    test('throws error when response structure is invalid - no choices', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      await expect(
        service.convertHtmlToMarkdown(mockHtml, mockUrl)
      ).rejects.toThrow('No content generated by OpenRouter API');
    });

    test('throws error when response structure is invalid - empty choices', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [] })
      });

      await expect(
        service.convertHtmlToMarkdown(mockHtml, mockUrl)
      ).rejects.toThrow('No content generated by OpenRouter API');
    });

    test('throws error when response structure is invalid - no message', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{}]
        })
      });

      await expect(
        service.convertHtmlToMarkdown(mockHtml, mockUrl)
      ).rejects.toThrow('No content generated by OpenRouter API');
    });

    test('throws error when response structure is invalid - null content', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: null } }]
        })
      });

      await expect(
        service.convertHtmlToMarkdown(mockHtml, mockUrl)
      ).rejects.toThrow('No content generated by OpenRouter API');
    });

    test('handles network errors', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(
        service.convertHtmlToMarkdown(mockHtml, mockUrl)
      ).rejects.toThrow('Network failure');
    });

    test('trims whitespace from response', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: '  \n# Title\n\nContent\n  '
            }
          }
        ]
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await service.convertHtmlToMarkdown(mockHtml, mockUrl);

      expect(result).toBe('# Title\n\nContent');
    });

    test('logs progress messages', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'result' } }]
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      await service.convertHtmlToMarkdown(mockHtml, mockUrl);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('OpenRouter')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(mockModel)
      );
    });

    test('works with different models', async () => {
      const claudeService = new OpenRouterService(mockApiKey, 'anthropic/claude-2');
      const mockResponse = {
        choices: [{ message: { content: 'result' } }]
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      await claudeService.convertHtmlToMarkdown(mockHtml, mockUrl);

      const fetchCall = global.fetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.model).toBe('anthropic/claude-2');
    });

    test('works with Meta Llama model', async () => {
      const llamaService = new OpenRouterService(mockApiKey, 'meta-llama/llama-2-70b-chat');
      const mockResponse = {
        choices: [{ message: { content: 'result' } }]
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      await llamaService.convertHtmlToMarkdown(mockHtml, mockUrl);

      const fetchCall = global.fetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.model).toBe('meta-llama/llama-2-70b-chat');
    });

    test('handles 429 rate limit error', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded'
      });

      await expect(
        service.convertHtmlToMarkdown(mockHtml, mockUrl)
      ).rejects.toThrow('OpenRouter API error (429): Rate limit exceeded');
    });

    test('handles 500 server error', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error'
      });

      await expect(
        service.convertHtmlToMarkdown(mockHtml, mockUrl)
      ).rejects.toThrow('OpenRouter API error (500): Internal server error');
    });
  });

  describe('buildConversionPrompt integration', () => {
    test('uses base class prompt builder', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'result' } }]
      };
      const html = '<p>test</p>';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      await service.convertHtmlToMarkdown(html, 'https://example.com');

      const fetchCall = global.fetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      // Verify it uses the base class prompt format
      expect(requestBody.messages[0].content).toContain('Extract the main article content');
      expect(requestBody.messages[0].content).toContain('Focus on: title, headings');
      expect(requestBody.messages[0].content).toContain('Return only clean Markdown');
    });
  });
});
