import { MockLLMService } from './mockLlmService.js';
import { GeminiApiService } from './geminiApiService.js';
import { OllamaService } from './ollamaService.js';
import { OpenRouterService } from './openrouterService.js';

/**
 * Factory function to create the appropriate LLM service
 * @param {Object|boolean} configOrUseMock - Service configuration object OR legacy useMock boolean
 * @returns {LLMService} - An instance of an LLM service
 *
 * @example
 * // Mock service
 * const service = createLLMService({ serviceType: 'mock' });
 *
 * // Gemini API
 * const service = createLLMService({
 *   serviceType: 'api',
 *   apiKey: 'your-key',
 *   modelName: 'gemini-1.5-flash'
 * });
 *
 * // Ollama
 * const service = createLLMService({
 *   serviceType: 'ollama',
 *   ollamaBaseUrl: 'http://localhost:11434',
 *   ollamaModel: 'llama2'
 * });
 *
 * // OpenRouter
 * const service = createLLMService({
 *   serviceType: 'openrouter',
 *   openrouterApiKey: 'your-key',
 *   openrouterModel: 'openai/gpt-3.5-turbo'
 * });
 *
 * // Legacy boolean signature
 * const service = createLLMService(true); // returns mock
 */
export function createLLMService(configOrUseMock = {}) {
  // Handle legacy signature: createLLMService(useMock)
  let config;
  if (typeof configOrUseMock === 'boolean') {
    config = {
      useMock: configOrUseMock,
      serviceType: configOrUseMock ? 'mock' : 'api'
    };
  } else {
    config = configOrUseMock;
  }

  const {
    useMock = false,
    serviceType = 'api',
    apiKey = null,
    modelName = 'gemini-1.5-flash',
    ollamaBaseUrl = 'http://localhost:11434',
    ollamaModel = 'llama2',
    openrouterApiKey = null,
    openrouterModel = 'openai/gpt-3.5-turbo'
  } = config;

  // Legacy support: if useMock is true, return mock service
  if (useMock) {
    return new MockLLMService();
  }

  // Create service based on type
  switch (serviceType.toLowerCase()) {
    case 'mock':
      return new MockLLMService();

    case 'api':
      if (!apiKey) {
        throw new Error('apiKey is required for API-based service');
      }
      return new GeminiApiService(apiKey, modelName);

    case 'ollama':
      return new OllamaService(ollamaBaseUrl, ollamaModel);

    case 'openrouter':
      if (!openrouterApiKey) {
        throw new Error('openrouterApiKey is required for OpenRouter service');
      }
      return new OpenRouterService(openrouterApiKey, openrouterModel);

    default:
      throw new Error(`Invalid serviceType: ${serviceType}. Must be one of: api, mock, ollama, openrouter`);
  }
}
