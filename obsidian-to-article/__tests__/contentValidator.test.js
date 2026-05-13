import {
  isEcommerceDomain,
  hasNonArticlePatterns,
  analyzeContentStructure,
  validateArticleContent,
  ensureIsArticle
} from '../contentValidator.js';

describe('contentValidator', () => {
  describe('isEcommerceDomain', () => {
    it('should detect Amazon domains', () => {
      expect(isEcommerceDomain('https://www.amazon.com/product/123')).toBe(true);
      expect(isEcommerceDomain('https://amazon.co.uk/item')).toBe(true);
      expect(isEcommerceDomain('https://www.amazon.de/product')).toBe(true);
    });

    it('should detect other e-commerce sites', () => {
      expect(isEcommerceDomain('https://www.ebay.com/item/123')).toBe(true);
      expect(isEcommerceDomain('https://www.etsy.com/listing/456')).toBe(true);
      expect(isEcommerceDomain('https://www.walmart.com/ip/789')).toBe(true);
      expect(isEcommerceDomain('https://www.target.com/p/product')).toBe(true);
    });

    it('should not flag non-commerce domains', () => {
      expect(isEcommerceDomain('https://www.nytimes.com/article')).toBe(false);
      expect(isEcommerceDomain('https://www.medium.com/story')).toBe(false);
      expect(isEcommerceDomain('https://www.github.com/repo')).toBe(false);
    });

    it('should handle invalid URLs', () => {
      expect(isEcommerceDomain('not-a-url')).toBe(false);
      expect(isEcommerceDomain('')).toBe(false);
    });
  });

  describe('hasNonArticlePatterns', () => {
    it('should detect login pages', () => {
      const loginHtml = `
        <html>
          <head><title>Sign In</title></head>
          <body>
            <h1>Sign In</h1>
            <form>
              <input type="email" placeholder="Email">
              <input type="password" placeholder="Password">
              <button>Log in</button>
            </form>
          </body>
        </html>
      `;

      const result = hasNonArticlePatterns(loginHtml);
      expect(result.hasLoginPattern).toBe(true);
      expect(result.hasAnyNonArticlePattern).toBe(true);
    });

    it('should detect error pages', () => {
      const errorHtml = `
        <html>
          <head><title>404 Not Found</title></head>
          <body>
            <h1>Page Not Found</h1>
            <p>The page you're looking for doesn't exist.</p>
          </body>
        </html>
      `;

      const result = hasNonArticlePatterns(errorHtml);
      expect(result.hasErrorPattern).toBe(true);
      expect(result.hasAnyNonArticlePattern).toBe(true);
    });

    it('should detect commerce patterns', () => {
      const commerceHtml = `
        <html>
          <head><title>Buy Product</title></head>
          <body>
            <h1>Amazing Product</h1>
            <p>Price: $99.99</p>
            <button>Add to Cart</button>
            <button>Buy Now</button>
            <p>In Stock</p>
          </body>
        </html>
      `;

      const result = hasNonArticlePatterns(commerceHtml);
      expect(result.hasCommercePattern).toBe(true);
      expect(result.hasAnyNonArticlePattern).toBe(true);
    });

    it('should not flag article content', () => {
      const articleHtml = `
        <html>
          <head><title>Interesting Article</title></head>
          <body>
            <article>
              <h1>The Future of Technology</h1>
              <p>This is a fascinating article about technology trends.</p>
              <p>It contains multiple paragraphs of insightful content.</p>
              <p>Readers will find this information valuable.</p>
            </article>
          </body>
        </html>
      `;

      const result = hasNonArticlePatterns(articleHtml);
      expect(result.hasLoginPattern).toBe(false);
      expect(result.hasErrorPattern).toBe(false);
      expect(result.hasCommercePattern).toBe(false);
      expect(result.hasAnyNonArticlePattern).toBe(false);
    });
  });

  describe('analyzeContentStructure', () => {
    it('should recognize article tags', () => {
      const articleHtml = `
        <html>
          <body>
            <article>
              <h1>Article Title</h1>
              <p>First paragraph with substantial content that makes this a real article with enough text to meet the minimum requirements for validation.</p>
              <p>Second paragraph with more interesting information and additional details that help build up the content to sufficient length for proper analysis.</p>
              <p>Third paragraph to ensure we have enough content with even more detailed information about the topic being discussed in this article.</p>
              <p>Fourth paragraph for good measure, providing additional context and information to make this a comprehensive piece of content.</p>
            </article>
          </body>
        </html>
      `;

      const result = analyzeContentStructure(articleHtml);
      expect(result.hasArticleTag).toBe(true);
      expect(result.paragraphCount).toBeGreaterThanOrEqual(3);
      expect(result.hasMinimumContent).toBe(true);
    });

    it('should count paragraphs and headings', () => {
      const contentHtml = `
        <html>
          <body>
            <main>
              <h1>Main Heading</h1>
              <h2>Subheading</h2>
              <p>Paragraph one with enough content to be meaningful.</p>
              <p>Paragraph two with additional information.</p>
              <p>Paragraph three to round things out.</p>
              <h3>Another Section</h3>
              <p>More content here in the fourth paragraph.</p>
            </main>
          </body>
        </html>
      `;

      const result = analyzeContentStructure(contentHtml);
      expect(result.hasMainTag).toBe(true);
      expect(result.headingCount).toBeGreaterThanOrEqual(3);
      expect(result.paragraphCount).toBeGreaterThanOrEqual(4);
      expect(result.hasReasonableParagraphs).toBe(true);
    });

    it('should detect insufficient content', () => {
      const shortHtml = `
        <html>
          <body>
            <p>Short.</p>
          </body>
        </html>
      `;

      const result = analyzeContentStructure(shortHtml);
      expect(result.hasMinimumContent).toBe(false);
      expect(result.textLength).toBeLessThan(500);
    });

    it('should exclude script and style content', () => {
      const htmlWithScripts = `
        <html>
          <head>
            <style>body { color: red; }</style>
          </head>
          <body>
            <script>console.log('This should not be counted as content');</script>
            <h1>Real Content</h1>
            <p>This is the actual content that should be analyzed with enough text to be meaningful and substantial.</p>
            <p>More paragraphs here to make it substantial enough with detailed information about various topics.</p>
            <p>And another paragraph to ensure proper counting with additional details and information for readers.</p>
            <p>Yet another paragraph for good measure providing even more context and information.</p>
          </body>
        </html>
      `;

      const result = analyzeContentStructure(htmlWithScripts);
      // Text length should reflect actual content, not script
      expect(result.textLength).toBeGreaterThan(200);
      expect(result.paragraphCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('validateArticleContent', () => {
    const validArticleHtml = `
      <html>
        <head><title>Great Article</title></head>
        <body>
          <article>
            <h1>Understanding Modern Web Development</h1>
            <p>Web development has evolved significantly over the past decade, introducing new paradigms and tools that have transformed how we build applications.</p>
            <p>The rise of JavaScript frameworks like React, Vue, and Angular has made it easier to create dynamic, responsive user interfaces that provide excellent user experiences.</p>
            <p>Modern development practices emphasize component-based architecture, making code more maintainable and reusable across projects.</p>
            <h2>Key Trends</h2>
            <p>Several key trends are shaping the future of web development, including serverless architecture, progressive web apps, and improved build tools.</p>
          </article>
        </body>
      </html>
    `;

    it('should validate proper article content', () => {
      const result = validateArticleContent(validArticleHtml, 'https://example.com/article');
      expect(result.isValid).toBe(true);
      expect(result.reason).toBe('Valid article content');
    });

    it('should reject e-commerce domains', () => {
      const result = validateArticleContent(validArticleHtml, 'https://www.amazon.com/product/123');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('E-commerce');
    });

    it('should reject login pages', () => {
      const loginHtml = `
        <html>
          <body>
            <h1>Log In</h1>
            <form>
              <input type="email">
              <input type="password">
            </form>
            <p>Please log in to continue. Don't have an account? Sign up now!</p>
          </body>
        </html>
      `;

      const result = validateArticleContent(loginHtml, 'https://example.com/login');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Login');
    });

    it('should reject error pages', () => {
      const errorHtml = `
        <html>
          <body>
            <h1>404 - Page Not Found</h1>
            <p>Sorry, the page you're looking for doesn't exist.</p>
          </body>
        </html>
      `;

      const result = validateArticleContent(errorHtml, 'https://example.com/missing');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Error page');
    });

    it('should reject shopping pages', () => {
      const shoppingHtml = `
        <html>
          <body>
            <h1>Product Name</h1>
            <p>Amazing product description that goes on for quite a while to make sure we have enough content.</p>
            <p>Price: $99.99</p>
            <p>In Stock - Ships within 2 days</p>
            <button>Add to Cart</button>
            <button>Buy Now</button>
            <p>Customer Reviews section with lots of feedback and ratings from satisfied customers.</p>
          </body>
        </html>
      `;

      const result = validateArticleContent(shoppingHtml, 'https://example.com/product');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Shopping');
    });

    it('should reject content with insufficient text', () => {
      const shortHtml = `
        <html>
          <body>
            <h1>Title</h1>
            <p>Short content.</p>
          </body>
        </html>
      `;

      const result = validateArticleContent(shortHtml, 'https://example.com/short');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Insufficient content');
    });

    it('should reject content with too few paragraphs', () => {
      const fewParagraphsHtml = `
        <html>
          <body>
            <h1>Title</h1>
            <p>This is a longer paragraph that contains enough text to meet the minimum content requirement for length, but there are not enough paragraphs to make this a proper article. We need to have at least three paragraphs for good article structure and this paragraph provides substantial content.</p>
            <p>Here is a second paragraph that also has substantial content to ensure we meet length requirements. This paragraph adds more information and details to reach the minimum character count needed for validation while still not having enough paragraph structures.</p>
          </body>
        </html>
      `;

      const result = validateArticleContent(fewParagraphsHtml, 'https://example.com/few-paragraphs');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Too few paragraphs');
    });
  });

  describe('ensureIsArticle', () => {
    const validArticleHtml = `
      <html>
        <body>
          <article>
            <h1>Comprehensive Guide to Testing</h1>
            <p>Testing is a critical part of software development that ensures code quality and reliability. Without proper testing, applications can have hidden bugs that cause problems in production.</p>
            <p>There are many types of testing including unit tests, integration tests, and end-to-end tests. Each type serves a specific purpose in the quality assurance process and helps identify different categories of issues.</p>
            <p>Each type serves a different purpose and helps catch different kinds of bugs and issues. Unit tests focus on individual functions, integration tests check how components work together, and end-to-end tests validate complete user workflows.</p>
            <p>Good test coverage gives developers confidence when refactoring and adding new features. With a comprehensive test suite, teams can make changes quickly while ensuring existing functionality remains intact.</p>
          </article>
        </body>
      </html>
    `;

    it('should not throw for valid articles', () => {
      expect(() => {
        ensureIsArticle(validArticleHtml, 'https://example.com/article');
      }).not.toThrow();
    });

    it('should throw for e-commerce sites', () => {
      expect(() => {
        ensureIsArticle(validArticleHtml, 'https://www.amazon.com/product');
      }).toThrow('Not an article');
    });

    it('should throw error with NON_ARTICLE_CONTENT code', () => {
      try {
        ensureIsArticle(validArticleHtml, 'https://www.ebay.com/item');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error.code).toBe('NON_ARTICLE_CONTENT');
        expect(error.reason).toBeTruthy();
        expect(error.message).toContain('Not an article');
      }
    });

    it('should throw for login pages', () => {
      const loginHtml = `
        <html>
          <body>
            <h1>Sign In</h1>
            <p>Please sign in to your account to continue.</p>
            <form><input type="password"></form>
          </body>
        </html>
      `;

      expect(() => {
        ensureIsArticle(loginHtml, 'https://example.com/login');
      }).toThrow('Not an article');
    });

    it('should throw for insufficient content', () => {
      const shortHtml = '<html><body><p>Too short.</p></body></html>';

      expect(() => {
        ensureIsArticle(shortHtml, 'https://example.com/short');
      }).toThrow('Not an article');
    });
  });
});
