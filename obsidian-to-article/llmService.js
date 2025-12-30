/**
 * Base LLM Service class
 * Defines the interface that all LLM service implementations must follow
 */
export class LLMService {
  /**
   * Convert HTML content to Markdown using the LLM service
   * @param {string} html - The HTML content to convert
   * @param {string} url - The source URL (for logging/context)
   * @returns {Promise<string>} - The converted Markdown content
   */
  async convertHtmlToMarkdown(html, url) {
    throw new Error('convertHtmlToMarkdown() must be implemented by subclass');
  }

  /**
   * Build the prompt for HTML to Markdown conversion
   * @param {string} html - The HTML content
   * @returns {string} - The formatted prompt
   */
  buildConversionPrompt(html) {
    const truncatedHtml = html.length > 50000
      ? html.substring(0, 50000) + '\n\n[HTML truncated - too large]'
      : html;

    return `Extract the main article content from this HTML and convert to clean Markdown.

Focus on: title, headings, paragraphs, lists, quotes, code blocks.
Ignore: navigation, ads, sidebars, comments, footers.

HTML (${html.length} chars):
${truncatedHtml}

Return only clean Markdown:`;
  }

  /**
   * Get the service name for logging purposes
   * @returns {string} - The service name
   */
  getServiceName() {
    return 'LLMService';
  }
}
