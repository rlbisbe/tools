import axios from 'axios';
import { chromium } from 'playwright';
import { colors } from './logger.js';

/**
 * Extract URLs from Obsidian note content
 * Looks for plain URLs and markdown-style links
 */
export function extractUrls(content) {
  const urls = [];

  // Match markdown-style links [text](url) first
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = markdownLinkRegex.exec(content)) !== null) {
    urls.push(match[2]);
  }

  // Remove markdown links from content to avoid double-matching
  const contentWithoutMarkdown = content.replace(markdownLinkRegex, '');

  // Match plain URLs (excluding parentheses)
  const urlRegex = /https?:\/\/[^\s<>\[\]()]+/g;
  const plainUrls = contentWithoutMarkdown.match(urlRegex) || [];
  urls.push(...plainUrls);

  // Remove duplicates and return
  return [...new Set(urls)];
}

/**
 * Determine the type of URL
 * Returns: 'twitter', 'youtube', 'instagram', 'web'
 */
export function getUrlType(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
      return 'twitter';
    }
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      return 'youtube';
    }
    if (hostname.includes('instagram.com')) {
      return 'instagram';
    }

    return 'web';
  } catch (error) {
    console.warn(`Invalid URL: ${url}`);
    return 'invalid';
  }
}

/**
 * Check if a URL is a Twitter/X URL
 */
export function isTwitterUrl(url) {
  return getUrlType(url) === 'twitter';
}

/**
 * Check if a URL should be ignored (YouTube, Instagram)
 * Twitter is now handled separately
 */
export function shouldIgnoreUrl(url) {
  const urlType = getUrlType(url);
  return urlType === 'youtube' || urlType === 'instagram' || urlType === 'invalid';
}

/**
 * Fetch HTML content using Playwright (headless browser)
 * Used as fallback when axios fails with 4xx client errors (401, 403, 429, etc.)
 */
async function fetchWithHeadlessBrowser(url) {
  let browser = null;
  try {
    console.log(colors.dim(`Using headless browser for: ${url}`));

    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    // Navigate to the page and wait for network to be idle
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Get the HTML content
    const content = await page.content();

    return content;

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Fetch HTML content from a URL
 * Tries axios first, falls back to headless browser on 4xx errors
 */
export async function fetchUrlContent(url) {
  try {
    console.log(colors.dim(`Fetching: ${url}`));

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      },
      timeout: 30000, // 30 second timeout
      maxRedirects: 5
    });

    return response.data;

  } catch (error) {
    // If we get a 4xx client error (401, 403, 429, etc.), try with headless browser
    // These errors typically indicate blocking of automated requests
    if (error.response && error.response.status >= 400 && error.response.status < 500) {
      console.log(colors.warning(`Got ${error.response.status} error, retrying with headless browser...`));
      try {
        return await fetchWithHeadlessBrowser(url);
      } catch (browserError) {
        console.log(colors.error(`Headless browser also failed: ${browserError.message}`));
        throw browserError;
      }
    }

    console.log(colors.error(`Error fetching ${url}: ${error.message}`));
    throw error;
  }
}

/**
 * Sanitize filename for saving
 */
export function sanitizeFilename(str) {
  return str
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .substring(0, 100);
}

/**
 * Create a filename from URL
 */
export function createFilenameFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.replace(/\/$/, '');
    const lastPart = pathname.split('/').pop() || urlObj.hostname;
    return sanitizeFilename(lastPart);
  } catch (error) {
    return sanitizeFilename(url);
  }
}
