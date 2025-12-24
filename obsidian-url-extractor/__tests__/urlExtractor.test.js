import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper functions extracted for testing
export function extractUrlsFromLine(line) {
  const urls = [];

  // Match markdown-style links [text](url)
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = markdownLinkRegex.exec(line)) !== null) {
    urls.push({ url: match[2], type: 'markdown', fullMatch: match[0] });
  }

  // Match plain URLs (excluding already matched markdown links)
  let tempLine = line;
  urls.forEach(({ fullMatch }) => {
    tempLine = tempLine.replace(fullMatch, '');
  });

  const urlRegex = /https?:\/\/[^\s<>\[\]()]+/g;
  const plainMatches = tempLine.matchAll(urlRegex);
  for (const match of plainMatches) {
    urls.push({ url: match[0], type: 'plain', fullMatch: match[0] });
  }

  return urls;
}

export function isTodoLine(line) {
  return /^\s*-\s*\[[ x]\]/i.test(line);
}

export function createFilenameFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/^www\./, '');
    const pathname = urlObj.pathname.replace(/\/$/, '');
    const lastPart = pathname.split('/').filter(Boolean).pop() || hostname;

    const filename = `${hostname}-${lastPart}`
      .replace(/[^a-z0-9]/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .substring(0, 80);

    return filename;
  } catch (error) {
    return url
      .replace(/[^a-z0-9]/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .substring(0, 80);
  }
}

describe('URL Extractor', () => {
  describe('extractUrlsFromLine', () => {
    test('extracts plain URLs', () => {
      const line = 'Check this: https://example.com/article';
      const urls = extractUrlsFromLine(line);

      expect(urls).toHaveLength(1);
      expect(urls[0].url).toBe('https://example.com/article');
      expect(urls[0].type).toBe('plain');
    });

    test('extracts markdown links', () => {
      const line = 'Read [this article](https://example.com/post)';
      const urls = extractUrlsFromLine(line);

      expect(urls).toHaveLength(1);
      expect(urls[0].url).toBe('https://example.com/post');
      expect(urls[0].type).toBe('markdown');
    });

    test('extracts multiple URLs from one line', () => {
      const line = 'Check https://example.com and [this](https://test.com)';
      const urls = extractUrlsFromLine(line);

      expect(urls).toHaveLength(2);
      expect(urls[0].url).toBe('https://test.com');
      expect(urls[0].type).toBe('markdown');
      expect(urls[1].url).toBe('https://example.com');
      expect(urls[1].type).toBe('plain');
    });

    test('handles lines with no URLs', () => {
      const line = 'Just a regular todo item';
      const urls = extractUrlsFromLine(line);

      expect(urls).toHaveLength(0);
    });

    test('handles http and https URLs', () => {
      const line = 'http://example.com and https://secure.com';
      const urls = extractUrlsFromLine(line);

      expect(urls).toHaveLength(2);
      expect(urls[0].url).toBe('http://example.com');
      expect(urls[1].url).toBe('https://secure.com');
    });
  });

  describe('isTodoLine', () => {
    test('identifies unchecked todo items', () => {
      expect(isTodoLine('- [ ] Todo item')).toBe(true);
      expect(isTodoLine('  - [ ] Indented todo')).toBe(true);
    });

    test('identifies checked todo items', () => {
      expect(isTodoLine('- [x] Done item')).toBe(true);
      expect(isTodoLine('- [X] Done item uppercase')).toBe(true);
    });

    test('rejects non-todo lines', () => {
      expect(isTodoLine('Regular text')).toBe(false);
      expect(isTodoLine('- Regular list item')).toBe(false);
      expect(isTodoLine('# Header')).toBe(false);
    });
  });

  describe('createFilenameFromUrl', () => {
    test('creates filename from simple URL', () => {
      const filename = createFilenameFromUrl('https://example.com/article');
      expect(filename).toBe('example-com-article');
    });

    test('creates filename from URL with path', () => {
      const filename = createFilenameFromUrl('https://blog.example.com/2024/great-post');
      expect(filename).toBe('blog-example-com-great-post');
    });

    test('removes www prefix', () => {
      const filename = createFilenameFromUrl('https://www.example.com/page');
      expect(filename).toBe('example-com-page');
    });

    test('handles URLs without path', () => {
      const filename = createFilenameFromUrl('https://example.com');
      expect(filename).toBe('example-com-example-com');
    });

    test('sanitizes special characters', () => {
      const filename = createFilenameFromUrl('https://example.com/my_cool-article!');
      expect(filename).toBe('example-com-my-cool-article');
    });

    test('limits filename length', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(200);
      const filename = createFilenameFromUrl(longUrl);
      expect(filename.length).toBeLessThanOrEqual(80);
    });

    test('handles invalid URLs gracefully', () => {
      const filename = createFilenameFromUrl('not-a-valid-url');
      expect(filename).toBeTruthy();
      expect(filename).toBe('not-a-valid-url');
    });
  });
});
