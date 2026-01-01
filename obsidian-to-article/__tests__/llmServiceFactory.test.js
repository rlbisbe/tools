import { jest } from '@jest/globals';
import { createLLMService } from '../llmServiceFactory.js';

describe('LLMServiceFactory', () => {
  describe('createLLMService', () => {
    describe('mock service creation', () => {
      test('creates mock service with boolean true', () => {
        const service = createLLMService(true);
        expect(service).toBeDefined();
        expect(service.getServiceName()).toBe('MockGemini');
      });

      test('creates mock service with boolean false but serviceType mock', () => {
        const service = createLLMService({
          useMock: false,
          serviceType: 'mock'
        });
        expect(service).toBeDefined();
        expect(service.getServiceName()).toBe('MockGemini');
      });

      test('creates mock service with serviceType mock', () => {
        const service = createLLMService({ serviceType: 'mock' });
        expect(service).toBeDefined();
        expect(service.getServiceName()).toBe('MockGemini');
      });

      test('useMock overrides serviceType', () => {
        const service = createLLMService({
          useMock: true,
          serviceType: 'api',
          apiKey: 'test-key'
        });
        expect(service.getServiceName()).toBe('MockGemini');
      });
    });

    describe('API service creation', () => {
      test('creates API service with valid config', () => {
        const service = createLLMService({
          serviceType: 'api',
          apiKey: 'test-api-key'
        });
        expect(service).toBeDefined();
        expect(service.getServiceName()).toBe('GeminiAPI');
      });

      test('creates API service with custom model', () => {
        const service = createLLMService({
          serviceType: 'api',
          apiKey: 'test-key',
          modelName: 'gemini-1.5-pro'
        });
        expect(service).toBeDefined();
        expect(service.modelName).toBe('gemini-1.5-pro');
      });

      test('uses default model when not specified', () => {
        const service = createLLMService({
          serviceType: 'api',
          apiKey: 'test-key'
        });
        expect(service.modelName).toBe('gemini-1.5-flash');
      });

      test('throws error when apiKey is missing', () => {
        expect(() => createLLMService({ serviceType: 'api' }))
          .toThrow('apiKey is required for API-based service');
      });

      test('throws error when apiKey is null', () => {
        expect(() => createLLMService({
          serviceType: 'api',
          apiKey: null
        })).toThrow('apiKey is required for API-based service');
      });

      test('throws error when apiKey is empty string', () => {
        expect(() => createLLMService({
          serviceType: 'api',
          apiKey: ''
        })).toThrow('apiKey is required for API-based service');
      });
    });

    describe('Ollama service creation', () => {
      test('creates Ollama service with default config', () => {
        const service = createLLMService({ serviceType: 'ollama' });
        expect(service).toBeDefined();
        expect(service.getServiceName()).toBe('Ollama');
        expect(service.baseUrl).toBe('http://localhost:11434');
        expect(service.model).toBe('llama2');
      });

      test('creates Ollama service with custom base URL', () => {
        const service = createLLMService({
          serviceType: 'ollama',
          ollamaBaseUrl: 'http://custom:8080'
        });
        expect(service.baseUrl).toBe('http://custom:8080');
      });

      test('creates Ollama service with custom model', () => {
        const service = createLLMService({
          serviceType: 'ollama',
          ollamaModel: 'mistral'
        });
        expect(service.model).toBe('mistral');
      });

      test('creates Ollama service with both custom URL and model', () => {
        const service = createLLMService({
          serviceType: 'ollama',
          ollamaBaseUrl: 'http://remote:11434',
          ollamaModel: 'codellama'
        });
        expect(service.baseUrl).toBe('http://remote:11434');
        expect(service.model).toBe('codellama');
      });

      test('Ollama service has correct methods', () => {
        const service = createLLMService({ serviceType: 'ollama' });
        expect(service.convertHtmlToMarkdown).toBeDefined();
        expect(service.getServiceName).toBeDefined();
        expect(typeof service.convertHtmlToMarkdown).toBe('function');
        expect(typeof service.getServiceName).toBe('function');
      });
    });

    describe('OpenRouter service creation', () => {
      test('creates OpenRouter service with valid config', () => {
        const service = createLLMService({
          serviceType: 'openrouter',
          openrouterApiKey: 'test-api-key'
        });
        expect(service).toBeDefined();
        expect(service.getServiceName()).toBe('OpenRouter');
      });

      test('creates OpenRouter service with custom model', () => {
        const service = createLLMService({
          serviceType: 'openrouter',
          openrouterApiKey: 'test-key',
          openrouterModel: 'anthropic/claude-2'
        });
        expect(service).toBeDefined();
        expect(service.model).toBe('anthropic/claude-2');
      });

      test('uses default model when not specified', () => {
        const service = createLLMService({
          serviceType: 'openrouter',
          openrouterApiKey: 'test-key'
        });
        expect(service.model).toBe('openai/gpt-3.5-turbo');
      });

      test('throws error when openrouterApiKey is missing', () => {
        expect(() => createLLMService({ serviceType: 'openrouter' }))
          .toThrow('openrouterApiKey is required for OpenRouter service');
      });

      test('throws error when openrouterApiKey is null', () => {
        expect(() => createLLMService({
          serviceType: 'openrouter',
          openrouterApiKey: null
        })).toThrow('openrouterApiKey is required for OpenRouter service');
      });

      test('throws error when openrouterApiKey is empty string', () => {
        expect(() => createLLMService({
          serviceType: 'openrouter',
          openrouterApiKey: ''
        })).toThrow('openrouterApiKey is required for OpenRouter service');
      });

      test('OpenRouter service has correct methods', () => {
        const service = createLLMService({
          serviceType: 'openrouter',
          openrouterApiKey: 'test-key'
        });
        expect(service.convertHtmlToMarkdown).toBeDefined();
        expect(service.getServiceName).toBeDefined();
        expect(typeof service.convertHtmlToMarkdown).toBe('function');
        expect(typeof service.getServiceName).toBe('function');
      });

      test('creates OpenRouter service with meta-llama model', () => {
        const service = createLLMService({
          serviceType: 'openrouter',
          openrouterApiKey: 'test-key',
          openrouterModel: 'meta-llama/llama-2-70b-chat'
        });
        expect(service.model).toBe('meta-llama/llama-2-70b-chat');
      });
    });

    describe('service type validation', () => {
      test('throws error for invalid service type', () => {
        expect(() => createLLMService({ serviceType: 'invalid' }))
          .toThrow('Invalid serviceType: invalid. Must be one of: api, mock, ollama, openrouter');
      });

      test('throws error for unknown service type', () => {
        expect(() => createLLMService({ serviceType: 'openai' }))
          .toThrow('Invalid serviceType');
      });

      test('handles case-insensitive service types', () => {
        const mockService = createLLMService({ serviceType: 'MOCK' });
        expect(mockService.getServiceName()).toBe('MockGemini');

        const apiService = createLLMService({
          serviceType: 'API',
          apiKey: 'test-key'
        });
        expect(apiService.getServiceName()).toBe('GeminiAPI');

        const ollamaService = createLLMService({ serviceType: 'OLLAMA' });
        expect(ollamaService.getServiceName()).toBe('Ollama');

        const openrouterService = createLLMService({
          serviceType: 'OPENROUTER',
          openrouterApiKey: 'test-key'
        });
        expect(openrouterService.getServiceName()).toBe('OpenRouter');
      });
    });

    describe('default behavior', () => {
      test('defaults to api service type which requires apiKey', () => {
        // Empty config defaults to serviceType='api', which requires an apiKey
        expect(() => createLLMService({}))
          .toThrow('apiKey is required for API-based service');
      });

      test('defaults serviceType to api when not specified', () => {
        // When apiKey is provided but no serviceType, should create API service
        const service = createLLMService({ apiKey: 'test' });
        expect(service.getServiceName()).toBe('GeminiAPI');
      });
    });

    describe('legacy boolean signature', () => {
      test('handles legacy true (mock)', () => {
        const service = createLLMService(true);
        expect(service.getServiceName()).toBe('MockGemini');
      });

      test('handles legacy false with defaults', () => {
        // Should try to create API service but fail due to missing key
        expect(() => createLLMService(false))
          .toThrow('apiKey is required');
      });
    });

    describe('config destructuring', () => {
      test('ignores extra config properties', () => {
        const service = createLLMService({
          serviceType: 'mock',
          extraProp: 'ignored',
          anotherProp: 123
        });
        expect(service).toBeDefined();
        expect(service.getServiceName()).toBe('MockGemini');
      });

      test('handles undefined config values', () => {
        const service = createLLMService({
          serviceType: 'ollama',
          ollamaBaseUrl: undefined,
          ollamaModel: undefined
        });
        expect(service.baseUrl).toBe('http://localhost:11434');
        expect(service.model).toBe('llama2');
      });
    });

    describe('all service types return LLMService interface', () => {
      test('all services have convertHtmlToMarkdown', () => {
        const mock = createLLMService({ serviceType: 'mock' });
        const api = createLLMService({ serviceType: 'api', apiKey: 'key' });
        const ollama = createLLMService({ serviceType: 'ollama' });
        const openrouter = createLLMService({ serviceType: 'openrouter', openrouterApiKey: 'key' });

        expect(mock.convertHtmlToMarkdown).toBeDefined();
        expect(api.convertHtmlToMarkdown).toBeDefined();
        expect(ollama.convertHtmlToMarkdown).toBeDefined();
        expect(openrouter.convertHtmlToMarkdown).toBeDefined();
      });

      test('all services have getServiceName', () => {
        const mock = createLLMService({ serviceType: 'mock' });
        const api = createLLMService({ serviceType: 'api', apiKey: 'key' });
        const ollama = createLLMService({ serviceType: 'ollama' });
        const openrouter = createLLMService({ serviceType: 'openrouter', openrouterApiKey: 'key' });

        expect(mock.getServiceName).toBeDefined();
        expect(api.getServiceName).toBeDefined();
        expect(ollama.getServiceName).toBeDefined();
        expect(openrouter.getServiceName).toBeDefined();
      });
    });
  });
});
