import * as cheerio from 'cheerio';
import { LLMService } from './llmService.js';
import { GeminiApiService } from './geminiApiService.js';
import { OllamaService } from './ollamaService.js';
import { colors } from './logger.js';

/**
 * Mock Gemini API service for testing without an API key
 * Converts HTML to basic Markdown using cheerio
 */
class MockGeminiService extends LLMService {
  getServiceName() {
    return 'MockGemini';
  }
  async convertHtmlToMarkdown(html, url) {
    console.log(colors.cyan('Using MOCK Gemini service'));
    const totalStart = Date.now();

    const parseStart = Date.now();
    const $ = cheerio.load(html);

    // Remove script and style tags
    $('script, style, nav, footer, aside').remove();

    // Try to find main content
    const mainContent = $('article, main, .content, #content, .post-content').first();
    const contentArea = mainContent.length > 0 ? mainContent : $('body');

    // Extract title
    let title = $('h1').first().text() || $('title').first().text() || 'Untitled Article';
    title = title.trim();
    const parseTime = Date.now() - parseStart;

    const processStart = Date.now();
    // Build markdown
    let markdown = `# ${title}\n\n`;

    // Extract paragraphs and headings
    contentArea.find('h1, h2, h3, h4, h5, h6, p, ul, ol, blockquote').each((i, elem) => {
      const tag = elem.name;
      const text = $(elem).text().trim();

      if (!text) return;

      switch(tag) {
        case 'h1':
          markdown += `# ${text}\n\n`;
          break;
        case 'h2':
          markdown += `## ${text}\n\n`;
          break;
        case 'h3':
          markdown += `### ${text}\n\n`;
          break;
        case 'h4':
          markdown += `#### ${text}\n\n`;
          break;
        case 'h5':
          markdown += `##### ${text}\n\n`;
          break;
        case 'h6':
          markdown += `###### ${text}\n\n`;
          break;
        case 'p':
          markdown += `${text}\n\n`;
          break;
        case 'blockquote':
          markdown += `> ${text}\n\n`;
          break;
        case 'ul':
        case 'ol':
          $(elem).find('li').each((j, li) => {
            const listText = $(li).text().trim();
            markdown += `- ${listText}\n`;
          });
          markdown += '\n';
          break;
      }
    });

    const processTime = Date.now() - processStart;
    const totalTime = Date.now() - totalStart;
    console.log(colors.dim(`Mock processing complete (parse: ${parseTime}ms, process: ${processTime}ms) | Total: ${totalTime}ms | Input: ${html.length} chars, Output: ${markdown.length} chars`));

    return markdown;
  }
}

/**
 * Factory function to create the appropriate LLM service
 * @param {Object|boolean} configOrUseMock - Service configuration object OR legacy useMock boolean
 * @returns {LLMService} - An instance of an LLM service
 */
export function createGeminiService(configOrUseMock = {}) {
  // Handle legacy signature: createGeminiService(useMock)
  let config;
  if (typeof configOrUseMock === 'boolean') {
    config = {
      useMock: configOrUseMock,
      serviceType: 'mock'
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
    ollamaModel = 'llama2'
  } = config;

  // Legacy support: if useMock is true, return mock service
  if (useMock) {
    return new MockGeminiService();
  }

  // Create service based on type
  switch (serviceType.toLowerCase()) {
    case 'mock':
      return new MockGeminiService();

    case 'api':
      if (!apiKey) {
        throw new Error('apiKey is required for API-based service');
      }
      return new GeminiApiService(apiKey, modelName);

    case 'ollama':
      return new OllamaService(ollamaBaseUrl, ollamaModel);

    default:
      throw new Error(`Invalid serviceType: ${serviceType}. Must be one of: api, mock, ollama`);
  }
}
