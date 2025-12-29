import { exec } from 'child_process';
import { promisify } from 'util';
import * as cheerio from 'cheerio';
import { logger, colors } from './logger.js';

const execAsync = promisify(exec);

/**
 * Mock Gemini API service for testing without an API key
 * Converts HTML to basic Markdown using cheerio
 */
class MockGeminiService {
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
class GeminiService {
  constructor(cliCommand = 'gemini', toolType = 'gemini') {
    this.cliCommand = cliCommand;
    this.toolType = toolType.toLowerCase();
  }

  /**
   * Get the appropriate command format for the CLI tool
   * Returns command that accepts prompt via stdin
   */
  getToolCommand() {
    switch (this.toolType) {
      case 'kiro':
        // Kiro CLI: reads from stdin with --no-interactive
        return `${this.cliCommand} chat --no-interactive --trust-all-tools`;

      case 'claude':
        // Claude Code CLI: use -p flag with dash to read from stdin
        return `${this.cliCommand} -p -`;

      case 'gemini':
      default:
        // Gemini CLI: use -p flag with dash to read from stdin
        return `${this.cliCommand} -p -`;
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
      const prompt = `Extract the main article content from this HTML and convert to clean Markdown.

Focus on: title, headings, paragraphs, lists, quotes, code blocks.
Ignore: navigation, ads, sidebars, comments, footers.

HTML (${html.length} chars):
${html.length > 50000 ? html.substring(0, 50000) + '\n\n[HTML truncated - too large]' : html}

Return only clean Markdown:`;
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
      // Use stdin for prompts to avoid command-line length limits
      const command = this.getToolCommand();

      await logger.debug(`Executing ${toolName} CLI command`, {
        command,
        promptLength: prompt.length,
        timestamp: new Date().toISOString()
      });

      console.log(colors.dim(`Executing: ${command}`));
      console.log(colors.dim(`Prompt size: ${prompt.length} chars (${(prompt.length / 1024).toFixed(2)} KB)`));
      console.log(colors.dim(`Waiting for ${toolName} CLI response...`));

      const { stdout, stderr } = await execAsync(command, {
        input: prompt,  // Pass prompt via stdin
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

      // Detailed error logging
      const errorDetails = {
        url,
        error: error.message,
        code: error.code,
        signal: error.signal,
        killed: error.killed,
        stdout: error.stdout?.substring(0, 1000), // First 1000 chars
        stderr: error.stderr?.substring(0, 1000), // First 1000 chars
        totalTime,
        toolType: this.toolType,
        command: this.getToolCommand(),
        timestamp: new Date().toISOString()
      };

      await logger.error(`${toolName} CLI error`, errorDetails);

      console.log(colors.error(`\n❌ Error calling ${toolName} CLI:`));
      console.log(colors.error(`   Message: ${error.message}`));
      console.log(colors.error(`   Code: ${error.code || 'N/A'}`));
      console.log(colors.error(`   Signal: ${error.signal || 'N/A'}`));
      console.log(colors.error(`   Killed: ${error.killed || false}`));
      console.log(colors.error(`   Time elapsed: ${totalTime}ms`));

      if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
        console.log(colors.error(`   This error indicates output exceeded maxBuffer (10MB)`));
      } else if (error.signal === 'SIGTERM' || error.killed) {
        console.log(colors.error(`   This error indicates the process was killed (timeout: 120s)`));
      }

      if (error.stderr) {
        console.log(colors.error(`\n   CLI stderr (first 500 chars):`));
        console.log(colors.error(`   ${error.stderr.substring(0, 500)}`));
      }
      if (error.stdout) {
        console.log(colors.error(`\n   CLI stdout (first 500 chars):`));
        console.log(colors.error(`   ${error.stdout.substring(0, 500)}`));
      }

      throw error;
    }
  }
}

/**
 * Factory function to create the appropriate AI CLI service
 * @param {boolean} useMock - Whether to use the mock service
 * @param {string} cliCommand - The CLI command to execute (e.g., 'gemini', 'kiro', 'claude')
 * @param {string} toolType - The type of CLI tool ('gemini', 'kiro', or 'claude')
 */
export function createGeminiService(useMock = true, cliCommand = 'gemini', toolType = 'gemini') {
  if (useMock) {
    return new MockGeminiService();
  }

  if (!cliCommand) {
    throw new Error('CLI_COMMAND is required when not using mock service');
  }

  // Validate tool type
  const validToolTypes = ['gemini', 'kiro', 'claude'];
  const normalizedToolType = toolType.toLowerCase();
  if (!validToolTypes.includes(normalizedToolType)) {
    throw new Error(`Invalid CLI_TOOL_TYPE: ${toolType}. Must be one of: ${validToolTypes.join(', ')}`);
  }

  return new GeminiService(cliCommand, normalizedToolType);
}
