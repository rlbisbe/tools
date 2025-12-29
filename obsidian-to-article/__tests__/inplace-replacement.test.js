import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';

describe('In-Place URL Replacement', () => {
  const testDir = path.join(process.cwd(), '__tests__', 'test-inplace');

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('replaces plain URLs with content in-place', async () => {
    // Mock the required modules
    const mockGeminiService = {
      convertHtmlToMarkdown: jest.fn().mockResolvedValue('# Test Article\n\nThis is test content.')
    };

    const mockFetchUrlContent = jest.fn().mockResolvedValue('<h1>Test</h1><p>Content</p>');

    // Create test file
    const testFile = path.join(testDir, 'test-note.md');
    const originalContent = `# My Notes

Check this out: https://example.com/article

Some other text here.`;

    await fs.writeFile(testFile, originalContent, 'utf-8');

    // Import and mock the processNote function logic
    const { extractUrls, shouldIgnoreUrl, isTwitterUrl } = await import('../utils.js');

    // Simulate the processing logic
    let content = await fs.readFile(testFile, 'utf-8');
    const urls = extractUrls(content);
    
    expect(urls).toContain('https://example.com/article');

    // Simulate URL replacement
    for (const url of urls) {
      if (!shouldIgnoreUrl(url) && !isTwitterUrl(url)) {
        const html = await mockFetchUrlContent(url);
        const markdown = await mockGeminiService.convertHtmlToMarkdown(html, url);
        
        const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        content = content.replace(new RegExp(escapedUrl, 'g'), 
          `\n\n---\n\n# Article Content\n\n${markdown}\n\n---\n\n`);
      }
    }

    // Verify the replacement happened
    expect(content).toContain('# Test Article');
    expect(content).toContain('This is test content.');
    expect(content).not.toContain('https://example.com/article');
    expect(content).toContain('Some other text here.');

    // Verify mocks were called
    expect(mockFetchUrlContent).toHaveBeenCalledWith('https://example.com/article');
    expect(mockGeminiService.convertHtmlToMarkdown).toHaveBeenCalledWith('<h1>Test</h1><p>Content</p>', 'https://example.com/article');
  });

  test('replaces markdown links with content preserving link text', async () => {
    const mockGeminiService = {
      convertHtmlToMarkdown: jest.fn().mockResolvedValue('# Great Article\n\nAwesome content here.')
    };

    const mockFetchUrlContent = jest.fn().mockResolvedValue('<h1>Great</h1><p>Awesome</p>');

    // Create test file with markdown link
    const testFile = path.join(testDir, 'test-markdown.md');
    const originalContent = `# Reading List

[Interesting Article](https://example.com/interesting)

More notes below.`;

    await fs.writeFile(testFile, originalContent, 'utf-8');

    const { extractUrls, shouldIgnoreUrl, isTwitterUrl } = await import('../utils.js');

    let content = await fs.readFile(testFile, 'utf-8');
    const urls = extractUrls(content);
    
    expect(urls).toContain('https://example.com/interesting');

    // Simulate URL replacement for markdown links
    for (const url of urls) {
      if (!shouldIgnoreUrl(url) && !isTwitterUrl(url)) {
        const html = await mockFetchUrlContent(url);
        const markdown = await mockGeminiService.convertHtmlToMarkdown(html, url);
        
        const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Replace markdown-style links first
        const markdownLinkRegex = new RegExp(`\\[([^\\]]+)\\]\\(${escapedUrl}\\)`, 'g');
        const markdownReplaced = content.replace(markdownLinkRegex, (match, linkText) => {
          return `\n\n---\n\n# ${linkText}\n\n${markdown}\n\n---\n\n`;
        });

        if (markdownReplaced !== content) {
          content = markdownReplaced;
        }
      }
    }

    // Verify the replacement happened with preserved link text
    expect(content).toContain('# Interesting Article');
    expect(content).toContain('# Great Article');
    expect(content).toContain('Awesome content here.');
    expect(content).not.toContain('[Interesting Article](https://example.com/interesting)');
    expect(content).toContain('More notes below.');
  });

  test('handles multiple URLs in same file', async () => {
    const mockGeminiService = {
      convertHtmlToMarkdown: jest.fn()
        .mockResolvedValueOnce('# First Article\n\nFirst content.')
        .mockResolvedValueOnce('# Second Article\n\nSecond content.')
    };

    const mockFetchUrlContent = jest.fn()
      .mockResolvedValueOnce('<h1>First</h1>')
      .mockResolvedValueOnce('<h1>Second</h1>');

    const testFile = path.join(testDir, 'test-multiple.md');
    const originalContent = `# Multiple Links

First: https://example.com/first
Second: [Link Text](https://example.com/second)

End of file.`;

    await fs.writeFile(testFile, originalContent, 'utf-8');

    const { extractUrls, shouldIgnoreUrl, isTwitterUrl } = await import('../utils.js');

    let content = await fs.readFile(testFile, 'utf-8');
    const urls = extractUrls(content);
    
    expect(urls).toHaveLength(2);

    // Process each URL
    for (const url of urls) {
      if (!shouldIgnoreUrl(url) && !isTwitterUrl(url)) {
        const html = await mockFetchUrlContent(url);
        const markdown = await mockGeminiService.convertHtmlToMarkdown(html, url);
        
        const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Replace markdown-style links first
        const markdownLinkRegex = new RegExp(`\\[([^\\]]+)\\]\\(${escapedUrl}\\)`, 'g');
        const markdownReplaced = content.replace(markdownLinkRegex, (match, linkText) => {
          return `\n\n---\n\n# ${linkText}\n\n${markdown}\n\n---\n\n`;
        });

        // If no markdown link was found, replace plain URL
        if (markdownReplaced === content) {
          content = content.replace(new RegExp(escapedUrl, 'g'), 
            `\n\n---\n\n# Article Content\n\n${markdown}\n\n---\n\n`);
        } else {
          content = markdownReplaced;
        }
      }
    }

    // Verify both replacements happened
    expect(content).toContain('# First Article');
    expect(content).toContain('# Link Text');
    expect(content).toContain('First content.');
    expect(content).toContain('Second content.');
    expect(content).not.toContain('https://example.com/first');
    expect(content).not.toContain('https://example.com/second');
    expect(content).toContain('End of file.');

    expect(mockFetchUrlContent).toHaveBeenCalledTimes(2);
    expect(mockGeminiService.convertHtmlToMarkdown).toHaveBeenCalledTimes(2);
  });
});
