import { LLMService } from '../llmService.js';

describe('LLMService', () => {
  let service;

  beforeEach(() => {
    service = new LLMService();
  });

  describe('convertHtmlToMarkdown', () => {
    test('throws error when not implemented', async () => {
      await expect(service.convertHtmlToMarkdown('<html></html>', 'http://example.com'))
        .rejects.toThrow('convertHtmlToMarkdown() must be implemented by subclass');
    });
  });

  describe('buildConversionPrompt', () => {
    test('builds prompt with short HTML', () => {
      const html = '<html><body><h1>Title</h1><p>Content</p></body></html>';
      const prompt = service.buildConversionPrompt(html);

      expect(prompt).toContain('Extract the main article content');
      expect(prompt).toContain('Focus on: title, headings, paragraphs, lists, quotes, code blocks');
      expect(prompt).toContain('Ignore: navigation, ads, sidebars, comments, footers');
      expect(prompt).toContain(`HTML (${html.length} chars):`);
      expect(prompt).toContain(html);
      expect(prompt).toContain('Return only clean Markdown:');
    });

    test('truncates long HTML (over 50000 chars)', () => {
      const html = 'x'.repeat(60000);
      const prompt = service.buildConversionPrompt(html);

      expect(prompt).toContain(`HTML (${html.length} chars):`);
      expect(prompt).toContain('[HTML truncated - too large]');
      expect(prompt).not.toContain('x'.repeat(55000)); // Should not contain full content
      expect(prompt.includes('x'.repeat(49999))).toBe(true); // Should contain up to 50000 chars
    });

    test('does not truncate HTML exactly at 50000 chars', () => {
      const html = 'x'.repeat(50000);
      const prompt = service.buildConversionPrompt(html);

      expect(prompt).toContain(html);
      expect(prompt).not.toContain('[HTML truncated - too large]');
    });

    test('truncates HTML just over 50000 chars', () => {
      const html = 'x'.repeat(50001);
      const prompt = service.buildConversionPrompt(html);

      expect(prompt).toContain('[HTML truncated - too large]');
      expect(prompt).toContain('x'.repeat(50000));
    });

    test('handles empty HTML', () => {
      const html = '';
      const prompt = service.buildConversionPrompt(html);

      expect(prompt).toContain('HTML (0 chars):');
      expect(prompt).toContain('Return only clean Markdown:');
    });

    test('handles HTML with special characters', () => {
      const html = '<html><body><p>Special chars: <>&"\'</p></body></html>';
      const prompt = service.buildConversionPrompt(html);

      expect(prompt).toContain(html);
      expect(prompt).toContain('<>&"\'');
    });

    test('handles HTML with newlines and whitespace', () => {
      const html = `<html>
  <body>
    <h1>Title</h1>
    <p>Content</p>
  </body>
</html>`;
      const prompt = service.buildConversionPrompt(html);

      expect(prompt).toContain(html);
    });
  });

  describe('getServiceName', () => {
    test('returns default service name', () => {
      expect(service.getServiceName()).toBe('LLMService');
    });
  });

  describe('inheritance', () => {
    class TestLLMService extends LLMService {
      async convertHtmlToMarkdown(html, url) {
        return '# Test Markdown';
      }

      getServiceName() {
        return 'TestService';
      }
    }

    test('subclass can implement convertHtmlToMarkdown', async () => {
      const testService = new TestLLMService();
      const result = await testService.convertHtmlToMarkdown('<html></html>', 'http://example.com');
      expect(result).toBe('# Test Markdown');
    });

    test('subclass can override getServiceName', () => {
      const testService = new TestLLMService();
      expect(testService.getServiceName()).toBe('TestService');
    });

    test('subclass inherits buildConversionPrompt', () => {
      const testService = new TestLLMService();
      const html = '<html><body>Test</body></html>';
      const prompt = testService.buildConversionPrompt(html);

      expect(prompt).toContain('Extract the main article content');
      expect(prompt).toContain(html);
    });
  });
});
