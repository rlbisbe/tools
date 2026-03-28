import * as cheerio from 'cheerio';

/**
 * Content Validator - Determines if a webpage is an article or non-article page
 * Filters out e-commerce sites, login pages, error pages, and other non-article content
 */

/**
 * List of e-commerce and shopping site domains to filter out
 */
const E_COMMERCE_DOMAINS = [
  'amazon.com',
  'amazon.co.uk',
  'amazon.ca',
  'amazon.de',
  'amazon.fr',
  'amazon.it',
  'amazon.es',
  'amazon.co.jp',
  'ebay.com',
  'etsy.com',
  'walmart.com',
  'target.com',
  'aliexpress.com',
  'alibaba.com',
  'shopify.com',
  'shop.app',
  'bestbuy.com',
  'newegg.com',
  'wayfair.com',
  'homedepot.com',
  'lowes.com',
  'costco.com',
  'ikea.com',
  'zappos.com',
  'nordstrom.com',
  'macys.com',
  'overstock.com',
  'wish.com',
  'banggood.com',
  'gearbest.com',
  'jd.com',
  'tmall.com',
  'taobao.com',
  'rakuten.com',
  'mercadolibre.com',
  'flipkart.com',
  'snapdeal.com',
];

/**
 * Patterns that indicate non-article pages
 */
const NON_ARTICLE_PATTERNS = {
  // Login/signup page indicators
  login: [
    /sign\s*in/i,
    /log\s*in/i,
    /sign\s*up/i,
    /create\s*account/i,
    /register/i,
    /authentication/i,
    /forgot\s*password/i,
    /reset\s*password/i,
  ],

  // Error page indicators
  error: [
    /404\s*not\s*found/i,
    /page\s*not\s*found/i,
    /403\s*forbidden/i,
    /access\s*denied/i,
    /500\s*internal\s*server\s*error/i,
    /503\s*service\s*unavailable/i,
    /error\s*occurred/i,
  ],

  // Shopping/commerce indicators (in addition to domain check)
  commerce: [
    /add\s*to\s*(cart|basket)/i,
    /buy\s*now/i,
    /shopping\s*cart/i,
    /checkout/i,
    /price:\s*\$/i,
    /\$\d+\.\d{2}/,
    /in\s*stock/i,
    /out\s*of\s*stock/i,
    /product\s*details/i,
    /customer\s*reviews/i,
  ],
};

/**
 * Check if URL is from an e-commerce domain
 */
export function isEcommerceDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    return E_COMMERCE_DOMAINS.some(domain => hostname.includes(domain));
  } catch (error) {
    return false;
  }
}

/**
 * Check if HTML content matches non-article patterns
 */
export function hasNonArticlePatterns(html) {
  const $ = cheerio.load(html);

  // Get title and visible text content
  const title = $('title').text().toLowerCase();
  const bodyText = $('body').text().toLowerCase();

  // Combine for pattern matching
  const combinedText = `${title} ${bodyText}`;

  // Check for login page patterns
  const hasLoginPattern = NON_ARTICLE_PATTERNS.login.some(pattern =>
    pattern.test(combinedText)
  );

  // Check for error page patterns
  const hasErrorPattern = NON_ARTICLE_PATTERNS.error.some(pattern =>
    pattern.test(combinedText)
  );

  // Check for commerce patterns
  const hasCommercePattern = NON_ARTICLE_PATTERNS.commerce.some(pattern =>
    pattern.test(combinedText)
  );

  return {
    hasLoginPattern,
    hasErrorPattern,
    hasCommercePattern,
    hasAnyNonArticlePattern: hasLoginPattern || hasErrorPattern || hasCommercePattern
  };
}

/**
 * Analyze content structure to determine if it's article-like
 */
export function analyzeContentStructure(html) {
  const $ = cheerio.load(html);

  // Remove script, style, and other non-content tags
  $('script, style, nav, header, footer, aside, iframe, noscript').remove();

  // Check for article-like semantic elements
  const hasArticleTag = $('article').length > 0;
  const hasMainTag = $('main').length > 0;

  // Get text content
  const textContent = $('body').text().trim();
  const textLength = textContent.length;

  // Count paragraphs and headings
  const paragraphCount = $('p').length;
  const headingCount = $('h1, h2, h3, h4, h5, h6').length;

  // Check for common article indicators
  const hasDateMeta = $('meta[property="article:published_time"], meta[name="date"], time').length > 0;
  const hasAuthorMeta = $('meta[name="author"], meta[property="article:author"], .author, .byline').length > 0;

  return {
    hasArticleTag,
    hasMainTag,
    textLength,
    paragraphCount,
    headingCount,
    hasDateMeta,
    hasAuthorMeta,

    // Heuristics for article-like content
    hasMinimumContent: textLength > 500,
    hasReasonableParagraphs: paragraphCount >= 3,
    hasHeadings: headingCount > 0,
  };
}

/**
 * Main validation function - determines if content is a valid article
 * Returns { isValid: boolean, reason: string }
 */
export function validateArticleContent(html, url) {
  // Check 1: E-commerce domain
  if (isEcommerceDomain(url)) {
    return {
      isValid: false,
      reason: 'E-commerce site detected (e.g., Amazon, eBay, etc.)'
    };
  }

  // Check 2: Non-article patterns (login, error, commerce)
  const patterns = hasNonArticlePatterns(html);
  if (patterns.hasLoginPattern) {
    return {
      isValid: false,
      reason: 'Login or signup page detected'
    };
  }

  if (patterns.hasErrorPattern) {
    return {
      isValid: false,
      reason: 'Error page detected (404, 403, etc.)'
    };
  }

  if (patterns.hasCommercePattern) {
    return {
      isValid: false,
      reason: 'Shopping or product page detected'
    };
  }

  // Check 3: Content structure analysis
  const structure = analyzeContentStructure(html);

  // Must have minimum content length
  if (!structure.hasMinimumContent) {
    return {
      isValid: false,
      reason: `Insufficient content (${structure.textLength} chars, minimum 500 required)`
    };
  }

  // Should have reasonable paragraph count
  if (!structure.hasReasonableParagraphs) {
    return {
      isValid: false,
      reason: `Too few paragraphs (${structure.paragraphCount}, minimum 3 required)`
    };
  }

  // Passed all checks
  return {
    isValid: true,
    reason: 'Valid article content',
    metadata: structure
  };
}

/**
 * Simple exported function for easy integration
 * Throws an error if content is not a valid article
 */
export function ensureIsArticle(html, url) {
  const validation = validateArticleContent(html, url);

  if (!validation.isValid) {
    const error = new Error(`Not an article: ${validation.reason}`);
    error.code = 'NON_ARTICLE_CONTENT';
    error.reason = validation.reason;
    throw error;
  }

  return validation;
}
