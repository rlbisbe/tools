/**
 * @deprecated This file exists for backward compatibility only.
 * Use llmServiceFactory.js instead.
 *
 * This module re-exports createLLMService as createGeminiService
 * to maintain backward compatibility with existing code.
 */
import { createLLMService } from './llmServiceFactory.js';

/**
 * Factory function to create the appropriate LLM service
 * @deprecated Use createLLMService from llmServiceFactory.js instead
 * @param {Object|boolean} configOrUseMock - Service configuration object OR legacy useMock boolean
 * @returns {LLMService} - An instance of an LLM service
 */
export function createGeminiService(configOrUseMock = {}) {
  return createLLMService(configOrUseMock);
}
