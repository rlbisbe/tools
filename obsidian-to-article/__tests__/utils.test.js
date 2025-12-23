import {
  extractUrls,
  getUrlType,
  isTwitterUrl,
  shouldIgnoreUrl,
  sanitizeFilename,
  createFilenameFromUrl
} from '../utils.js';

describe('extractUrls', () => {
  test('extracts plain URLs from content', () => {
    const content = 'Check out https://example.com and https://test.org';
    const urls = extractUrls(content);
    expect(urls).toContain('https://example.com');
    expect(urls).toContain('https://test.org');
    expect(urls).toHaveLength(2);
  });

  test('extracts markdown-style links', () => {
    const content = '[Link](https://example.com) and [Another](https://test.org)';
    const urls = extractUrls(content);
    expect(urls).toContain('https://example.com');
    expect(urls).toContain('https://test.org');
  });

  test('handles mixed URL formats', () => {
    const content = 'Plain: https://plain.com and [Markdown](https://markdown.com)';
    const urls = extractUrls(content);
    expect(urls).toHaveLength(2);
    expect(urls).toContain('https://plain.com');
    expect(urls).toContain('https://markdown.com');
  });

  test('removes duplicate URLs', () => {
    const content = 'https://example.com and https://example.com again';
    const urls = extractUrls(content);
    expect(urls).toHaveLength(1);
  });

  test('returns empty array when no URLs found', () => {
    const content = 'No URLs here';
    const urls = extractUrls(content);
    expect(urls).toHaveLength(0);
  });
});

describe('getUrlType', () => {
  test('identifies Twitter URLs', () => {
    expect(getUrlType('https://twitter.com/user/status/123')).toBe('twitter');
    expect(getUrlType('https://x.com/user/status/123')).toBe('twitter');
  });

  test('identifies YouTube URLs', () => {
    expect(getUrlType('https://youtube.com/watch?v=123')).toBe('youtube');
    expect(getUrlType('https://youtu.be/123')).toBe('youtube');
  });

  test('identifies Instagram URLs', () => {
    expect(getUrlType('https://instagram.com/p/123')).toBe('instagram');
  });

  test('identifies regular web URLs', () => {
    expect(getUrlType('https://example.com/article')).toBe('web');
    expect(getUrlType('https://news.site.org/story')).toBe('web');
  });

  test('handles invalid URLs', () => {
    expect(getUrlType('not-a-url')).toBe('invalid');
    expect(getUrlType('')).toBe('invalid');
  });
});

describe('isTwitterUrl', () => {
  test('returns true for Twitter URLs', () => {
    expect(isTwitterUrl('https://twitter.com/user/status/123')).toBe(true);
    expect(isTwitterUrl('https://x.com/user/status/123')).toBe(true);
  });

  test('returns false for non-Twitter URLs', () => {
    expect(isTwitterUrl('https://example.com')).toBe(false);
    expect(isTwitterUrl('https://youtube.com/watch?v=123')).toBe(false);
  });
});

describe('shouldIgnoreUrl', () => {
  test('ignores YouTube URLs', () => {
    expect(shouldIgnoreUrl('https://youtube.com/watch?v=123')).toBe(true);
    expect(shouldIgnoreUrl('https://youtu.be/123')).toBe(true);
  });

  test('ignores Instagram URLs', () => {
    expect(shouldIgnoreUrl('https://instagram.com/p/123')).toBe(true);
  });

  test('does not ignore Twitter URLs', () => {
    expect(shouldIgnoreUrl('https://twitter.com/user/status/123')).toBe(false);
    expect(shouldIgnoreUrl('https://x.com/user/status/123')).toBe(false);
  });

  test('does not ignore regular web URLs', () => {
    expect(shouldIgnoreUrl('https://example.com')).toBe(false);
  });

  test('ignores invalid URLs', () => {
    expect(shouldIgnoreUrl('not-a-url')).toBe(true);
  });
});

describe('sanitizeFilename', () => {
  test('converts spaces to hyphens', () => {
    expect(sanitizeFilename('hello world')).toBe('hello-world');
  });

  test('removes special characters', () => {
    expect(sanitizeFilename('hello@world!test#')).toBe('hello-world-test');
  });

  test('removes leading and trailing hyphens', () => {
    expect(sanitizeFilename('---hello---')).toBe('hello');
  });

  test('converts to lowercase', () => {
    expect(sanitizeFilename('HelloWorld')).toBe('helloworld');
  });

  test('limits length to 100 characters', () => {
    const longString = 'a'.repeat(150);
    expect(sanitizeFilename(longString)).toHaveLength(100);
  });

  test('collapses multiple hyphens', () => {
    expect(sanitizeFilename('hello---world')).toBe('hello-world');
  });
});

describe('createFilenameFromUrl', () => {
  test('creates filename from URL pathname', () => {
    const filename = createFilenameFromUrl('https://example.com/my-article');
    expect(filename).toBe('my-article');
  });

  test('uses hostname when no pathname', () => {
    const filename = createFilenameFromUrl('https://example.com');
    expect(filename).toBe('example-com');
  });

  test('handles URLs with trailing slash', () => {
    const filename = createFilenameFromUrl('https://example.com/article/');
    expect(filename).toBe('article');
  });

  test('sanitizes the filename', () => {
    const filename = createFilenameFromUrl('https://example.com/My Article!');
    expect(filename).toMatch(/^[a-z0-9-]+$/);
  });

  test('handles invalid URLs', () => {
    const filename = createFilenameFromUrl('not-a-url');
    expect(filename).toBeTruthy();
    expect(filename).toMatch(/^[a-z0-9-]+$/);
  });
});
