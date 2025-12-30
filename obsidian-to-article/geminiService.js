import { exec } from 'child_process';
import { promisify } from 'util';
import * as cheerio from 'cheerio';
import { LLMService } from './llmService.js';
import { GeminiApiService } from './geminiApiService.js';
import { logger, colors } from './logger.js';

const execAsync = promisify(exec);

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
 * Real AI CLI service
 * Supports multiple AI CLI tools: Gemini, Kiro, and Claude Code
 * Uses the specified CLI tool to convert HTML to well-formatted Markdown
 */
class GeminiService extends LLMService {
  constructor(cliCommand = 'gemini', toolType = 'gemini') {
    super();
    this.cliCommand = cliCommand;
    this.toolType = toolType.toLowerCase();
  }

  getServiceName() {
    return this.toolType.toUpperCase();
  }

  /**
   * Get the appropriate command format for the CLI tool
   */
  getToolCommand(prompt) {
    switch (this.toolType) {
      case 'kiro':
        // Kiro CLI expects prompt via stdin
        return this.cliCommand;
      case 'claude':
        // Claude Code CLI expects prompt via stdin
        return this.cliCommand;
      case 'gemini':
      default:
        // Gemini CLI expects prompt via stdin
        return this.cliCommand;
    }
  }

  async convertHtmlToMarkdown(html, url) {
    const toolName = this.toolType.toUpperCase();
    console.log(colors.cyan(`Using ${toolName} CLI tool`));
    const totalStart = Date.now();

    await logger.info(`Starting ${toolName} CLI call`, {
      url,
      htmlLength: html.length,
      toolType: this.toolType,
      timestamp: new Date().toISOString()
    });

    try {
      const promptStart = Date.now();
      const prompt = this.buildConversionPrompt(html);
      const promptTime = Date.now() - promptStart;
      console.log(colors.dim(`Prompt prepared (${promptTime}ms, ${html.length} chars HTML)`));

      await logger.debug(`${toolName} CLI request details`, {
        promptLength: prompt.length,
        htmlLength: html.length,
        truncated: html.length > 50000,
        cliCommand: this.cliCommand,
        toolType: this.toolType
      });

      const cliStart = Date.now();

      // Execute the CLI tool with the prompt
      // We pass the prompt via stdin to avoid shell escaping issues
      const command = this.getToolCommand(prompt);
      const { stdout, stderr } = await execAsync(command, {
        input: prompt,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
        timeout: 120000, // 2 minute timeout
        shell: true
      });

      const cliTime = Date.now() - cliStart;
      console.log(colors.success(`CLI call complete (${cliTime}ms)`));

      if (stderr) {
        await logger.warn(`${toolName} CLI stderr output`, {
          url,
          stderr: stderr.trim(),
          toolType: this.toolType
        });
        console.log(colors.warning(`CLI warnings: ${stderr.trim()}`));
      }

      await logger.info(`${toolName} CLI success`, {
        url,
        cliTime,
        outputSize: stdout.length,
        toolType: this.toolType
      });

      // Extract the generated text from CLI output
      const parseStart = Date.now();
      const generatedText = stdout.trim();

      if (!generatedText) {
        await logger.error(`No content generated by ${toolName} CLI`, {
          url,
          stdout,
          stderr,
          toolType: this.toolType
        });
        throw new Error(`No content generated by ${toolName} CLI`);
      }
      const parseTime = Date.now() - parseStart;
      const totalTime = Date.now() - totalStart;

      console.log(colors.dim(`Response parsed (${parseTime}ms) | Total: ${totalTime}ms | Output: ${generatedText.length} chars`));

      await logger.info(`${toolName} processing complete`, {
        url,
        totalTime,
        outputLength: generatedText.length,
        toolType: this.toolType
      });

      return generatedText;

    } catch (error) {
      const totalTime = Date.now() - totalStart;
      const toolName = this.toolType.toUpperCase();

      await logger.error(`${toolName} CLI error`, {
        url,
        error: error.message,
        code: error.code,
        stdout: error.stdout,
        stderr: error.stderr,
        totalTime,
        toolType: this.toolType
      });

      console.log(colors.error(`Error calling ${toolName} CLI: ${error.message}`));
      if (error.stderr) {
        console.log(colors.error(`CLI stderr: ${error.stderr}`));
      }
      throw error;
    }
  }
}

/**
 * Factory function to create the appropriate LLM service
 * @param {Object|boolean} configOrUseMock - Service configuration object OR legacy useMock boolean
 * @param {string} [cliCommand] - Legacy CLI command parameter
 * @param {string} [toolType] - Legacy tool type parameter
 * @returns {LLMService} - An instance of an LLM service
 */
export function createGeminiService(configOrUseMock = {}, cliCommand = 'gemini', toolType = 'gemini') {
  // Handle legacy signature: createGeminiService(useMock, cliCommand, toolType)
  let config;
  if (typeof configOrUseMock === 'boolean') {
    config = {
      useMock: configOrUseMock,
      serviceType: 'cli',
      cliCommand,
      toolType
    };
  } else {
    config = configOrUseMock;
  }

  const {
    useMock = false,
    serviceType = 'api',
    apiKey = null,
    modelName = 'gemini-1.5-flash',
    cliCommand: configCliCommand = 'gemini',
    toolType: configToolType = 'gemini'
  } = config;

  // Use config values or fall back to legacy parameters
  const finalCliCommand = configCliCommand || cliCommand;
  const finalToolType = configToolType || toolType;

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

    case 'cli':
      if (!finalCliCommand) {
        throw new Error('CLI_COMMAND is required when not using mock service');
      }

      // Validate tool type for CLI
      const validToolTypes = ['gemini', 'kiro', 'claude'];
      const normalizedToolType = finalToolType.toLowerCase();
      if (!validToolTypes.includes(normalizedToolType)) {
        throw new Error(`Invalid CLI_TOOL_TYPE: ${finalToolType}. Must be one of: ${validToolTypes.join(', ')}`);
      }

      return new GeminiService(finalCliCommand, normalizedToolType);

    default:
      throw new Error(`Invalid serviceType: ${serviceType}. Must be one of: api, cli, mock`);
  }
}
