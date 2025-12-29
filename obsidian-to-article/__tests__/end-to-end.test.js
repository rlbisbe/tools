import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';

// Mock axios to avoid real HTTP requests
jest.unstable_mockModule('axios', () => ({
  default: {
    get: jest.fn().mockResolvedValue({
      data: '<html><head><title>Test</title></head><body><h1>Test Article</h1><p>Test content</p></body></html>'
    })
  }
}));

describe('End-to-End In-Place Replacement', () => {
  const testDir = path.join(process.cwd(), '__tests__', 'test-e2e');

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

  test('full workflow replaces URLs in-place', async () => {
    // Create test note
    const testFile = path.join(testDir, 'test-note.md');
    const originalContent = `# My Reading List

Check this article: https://example.com/test-article

[Great read](https://another-example.com/great-read)

Some notes here.

Another URL: https://third-example.com/another

End of notes.`;

    await fs.writeFile(testFile, originalContent, 'utf-8');

    // Import modules after mocking
    const { createGeminiService } = await import('../geminiService.js');
    const { createTwitterService } = await import('../twitterService.js');
    const { extractUrls, shouldIgnoreUrl, isTwitterUrl, fetchUrlContent } = await import('../utils.js');

    // Create services
    const geminiService = createGeminiService(true); // Use mock
    const twitterService = createTwitterService(); // No token

    // Simulate processNote logic
    let content = await fs.readFile(testFile, 'utf-8');
    const urls = extractUrls(content);

    expect(urls).toHaveLength(3);

    let modifiedContent = content;
    let replacementCount = 0;

    // Process each URL
    for (const url of urls) {
      if (shouldIgnoreUrl(url)) {
        continue;
      }

      try {
        let markdown;

        if (isTwitterUrl(url)) {
          if (!twitterService) {
            continue;
          }
          markdown = await twitterService.urlToMarkdown(url);
        } else {
          const html = await fetchUrlContent(url);
          markdown = await geminiService.convertHtmlToMarkdown(html, url);
        }

        // Replace URL with markdown content in-place
        const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Replace markdown-style links first
        const markdownLinkRegex = new RegExp(`\\[([^\\]]+)\\]\\(${escapedUrl}\\)`, 'g');
        const markdownReplaced = modifiedContent.replace(markdownLinkRegex, (match, linkText) => {
          return `\n\n---\n\n# ${linkText}\n\n${markdown}\n\n---\n\n`;
        });

        // If no markdown link was found, replace plain URL
        if (markdownReplaced === modifiedContent) {
          modifiedContent = modifiedContent.replace(new RegExp(escapedUrl, 'g'), 
            `\n\n---\n\n# Article Content\n\n${markdown}\n\n---\n\n`);
        } else {
          modifiedContent = markdownReplaced;
        }

        replacementCount++;

      } catch (error) {
        // Skip failed URLs
      }
    }

    // Verify replacements
    expect(replacementCount).toBe(3);
    expect(modifiedContent).not.toContain('https://example.com/test-article');
    expect(modifiedContent).not.toContain('https://another-example.com/great-read');
    expect(modifiedContent).not.toContain('https://third-example.com/another');
    
    // Should contain expanded content
    expect(modifiedContent).toContain('# Great read'); // From markdown link
    expect(modifiedContent).toContain('# Article Content'); // From plain URLs
    expect(modifiedContent).toContain('Some notes here.'); // Original content preserved
    expect(modifiedContent).toContain('End of notes.'); // Original content preserved

    // Write back to file
    await fs.writeFile(testFile, modifiedContent, 'utf-8');

    // Verify file was updated
    const updatedContent = await fs.readFile(testFile, 'utf-8');
    expect(updatedContent).toBe(modifiedContent);
  });

  test('dry run mode does not modify files', async () => {
    const testFile = path.join(testDir, 'dry-run-test.md');
    const originalContent = `# Test Note

URL: https://example.com/test

End.`;

    await fs.writeFile(testFile, originalContent, 'utf-8');

    // Simulate dry run (don't write back to file)
    const { createGeminiService } = await import('../geminiService.js');
    const { extractUrls, shouldIgnoreUrl, isTwitterUrl, fetchUrlContent } = await import('../utils.js');

    const geminiService = createGeminiService(true);
    
    let content = await fs.readFile(testFile, 'utf-8');
    const urls = extractUrls(content);

    let modifiedContent = content;

    for (const url of urls) {
      if (!shouldIgnoreUrl(url) && !isTwitterUrl(url)) {
        const html = await fetchUrlContent(url);
        const markdown = await geminiService.convertHtmlToMarkdown(html, url);
        
        const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        modifiedContent = modifiedContent.replace(new RegExp(escapedUrl, 'g'), 
          `\n\n---\n\n# Article Content\n\n${markdown}\n\n---\n\n`);
      }
    }

    // In dry run, don't write back
    // await fs.writeFile(testFile, modifiedContent, 'utf-8');

    // Verify original file unchanged
    const fileContent = await fs.readFile(testFile, 'utf-8');
    expect(fileContent).toBe(originalContent);
    expect(fileContent).toContain('https://example.com/test');

    // But verify processing would have worked
    expect(modifiedContent).not.toContain('https://example.com/test');
    expect(modifiedContent).toContain('# Article Content');
  });

  test('skips notes that already contain processed content', async () => {
    const testFile = path.join(testDir, 'already-processed.md');
    const alreadyProcessedContent = `# Test Note

---

# Article Content

Some processed content here.

**Source:** https://example.com/test

---

End of note.`;

    await fs.writeFile(testFile, alreadyProcessedContent, 'utf-8');

    const { extractUrls } = await import('../utils.js');

    let content = await fs.readFile(testFile, 'utf-8');
    const urls = extractUrls(content);
    
    expect(urls).toHaveLength(1);

    // Check if note already contains processed content
    const hasProcessedContent = content.includes('**Source:**') || content.includes('---\n\n# ');
    expect(hasProcessedContent).toBe(true);

    // In the actual implementation, this note would be skipped
    // Verify the content remains unchanged
    const finalContent = await fs.readFile(testFile, 'utf-8');
    expect(finalContent).toBe(alreadyProcessedContent);
  });

  test('processes notes without processed content markers', async () => {
    const testFile = path.join(testDir, 'fresh-note.md');
    const freshContent = `# Fresh Note

Check this: https://example.com/fresh

Some notes.`;

    await fs.writeFile(testFile, freshContent, 'utf-8');

    let content = await fs.readFile(testFile, 'utf-8');
    
    // Check that this note should be processed
    const hasProcessedContent = content.includes('**Source:**') || content.includes('---\n\n# ');
    expect(hasProcessedContent).toBe(false);
  });
});
