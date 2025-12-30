import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';

describe('Integration Tests', () => {
  const testDir = path.join(process.cwd(), '__tests__', 'test-notes');
  const testOutputDir = path.join(process.cwd(), '__tests__', 'test-output');

  beforeAll(async () => {
    // Create test directories
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(testOutputDir, { recursive: true });
  });

  afterAll(async () => {
    // Cleanup test directories
    try {
      await fs.rm(testDir, { recursive: true, force: true });
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('URL extraction from Obsidian note', async () => {
    const { extractUrls } = await import('../utils.js');

    const noteContent = `# My Reading List

Check out this article: https://example.com/article

Great thread: https://twitter.com/user/status/123

[Markdown link](https://another-example.com/page)

YouTube video: https://youtube.com/watch?v=abc123
`;

    const urls = extractUrls(noteContent);

    expect(urls).toHaveLength(4);
    expect(urls).toContain('https://example.com/article');
    expect(urls).toContain('https://twitter.com/user/status/123');
    expect(urls).toContain('https://another-example.com/page');
    expect(urls).toContain('https://youtube.com/watch?v=abc123');
  });

  test('URL categorization', async () => {
    const { getUrlType, shouldIgnoreUrl, isTwitterUrl } = await import('../utils.js');

    const testUrls = [
      { url: 'https://example.com/article', type: 'web', ignore: false, twitter: false },
      { url: 'https://twitter.com/user/status/123', type: 'twitter', ignore: false, twitter: true },
      { url: 'https://youtube.com/watch?v=123', type: 'youtube', ignore: true, twitter: false },
      { url: 'https://instagram.com/p/123', type: 'instagram', ignore: true, twitter: false },
    ];

    testUrls.forEach(({ url, type, ignore, twitter }) => {
      expect(getUrlType(url)).toBe(type);
      expect(shouldIgnoreUrl(url)).toBe(ignore);
      expect(isTwitterUrl(url)).toBe(twitter);
    });
  });

  test('Mock Gemini service processes HTML', async () => {
    const { createLLMService } = await import('../llmServiceFactory.js');

    const service = createLLMService(true);
    const html = `
      <html>
        <head><title>Test Article</title></head>
        <body>
          <article>
            <h1>Test Article Title</h1>
            <p>This is the article content.</p>
            <p>Second paragraph.</p>
          </article>
        </body>
      </html>
    `;

    const markdown = await service.convertHtmlToMarkdown(html, 'https://example.com/test');

    expect(markdown).toBeTruthy();
    expect(markdown).toContain('Test Article Title');
  });

  test('Service factory functions', async () => {
    const { createLLMService } = await import('../llmServiceFactory.js');
    const { createTwitterService } = await import('../twitterService.js');

    // Test LLM service creation
    const mockService = createLLMService(true);
    expect(mockService).toBeDefined();
    expect(mockService.getServiceName()).toBe('MockGemini');

    const mockService2 = createLLMService({ serviceType: 'mock' });
    expect(mockService2).toBeDefined();
    expect(mockService2.getServiceName()).toBe('MockGemini');

    const apiService = createLLMService({ serviceType: 'api', apiKey: 'test-key' });
    expect(apiService).toBeDefined();
    expect(apiService.getServiceName()).toBe('GeminiAPI');

    expect(() => createLLMService({ serviceType: 'api' })).toThrow('apiKey is required');
    expect(() => createLLMService({ serviceType: 'invalid' })).toThrow('Invalid serviceType');

    // Test Twitter service creation
    const noTwitter = createTwitterService();
    expect(noTwitter).toBeNull();

    const twitter = createTwitterService('test-token');
    expect(twitter).toBeDefined();
  });

  test('Filename sanitization', async () => {
    const { sanitizeFilename, createFilenameFromUrl } = await import('../utils.js');

    expect(sanitizeFilename('Hello World!')).toMatch(/^[a-z0-9-]+$/);
    expect(sanitizeFilename('Test@#$%')).toMatch(/^[a-z0-9-]+$/);

    const filename = createFilenameFromUrl('https://example.com/my-great-article');
    expect(filename).toBe('my-great-article');
  });

  test('Complete workflow simulation', async () => {
    const { extractUrls, getUrlType } = await import('../utils.js');
    const { createLLMService } = await import('../llmServiceFactory.js');

    // Create a test note
    const noteContent = `# Test Note

Article: https://example.com/test-article
Tweet: https://twitter.com/user/status/123
Video: https://youtube.com/watch?v=test
`;

    // Extract URLs
    const urls = extractUrls(noteContent);
    expect(urls).toHaveLength(3);

    // Categorize URLs
    const categorized = urls.map(url => ({
      url,
      type: getUrlType(url)
    }));

    expect(categorized).toContainEqual({
      url: 'https://example.com/test-article',
      type: 'web'
    });
    expect(categorized).toContainEqual({
      url: 'https://twitter.com/user/status/123',
      type: 'twitter'
    });
    expect(categorized).toContainEqual({
      url: 'https://youtube.com/watch?v=test',
      type: 'youtube'
    });

    // Test mock Gemini processing
    const gemini = createLLMService(true);
    const markdown = await gemini.convertHtmlToMarkdown(
      '<h1>Test</h1><p>Content</p>',
      'https://example.com/test-article'
    );

    expect(markdown).toBeTruthy();
  });
});
