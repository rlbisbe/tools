import { jest } from '@jest/globals';

// Mock TwitterApi BEFORE importing the service
const mockSingleTweet = jest.fn();
const mockSearch = jest.fn();

const mockReadOnlyClient = {
  v2: {
    singleTweet: mockSingleTweet,
    search: mockSearch
  }
};

const mockTwitterApiInstance = {
  readOnly: mockReadOnlyClient
};

class MockTwitterApi {
  constructor(bearerToken) {
    this.bearerToken = bearerToken;
    this.readOnly = mockReadOnlyClient;
  }
}

jest.unstable_mockModule('twitter-api-v2', () => ({
  TwitterApi: MockTwitterApi
}));

// Import AFTER mocking
const { createTwitterService, TwitterService } = await import('../twitterService.js');

// Skip network-dependent tests in CI
const describeIfNetwork = process.env.SKIP_NETWORK_TESTS ? describe.skip : describe;

describeIfNetwork('TwitterService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createTwitterService', () => {
    test('returns null when no bearer token provided', () => {
      const service = createTwitterService();
      expect(service).toBeNull();
    });

    test('returns TwitterService instance when bearer token provided', () => {
      const service = createTwitterService('test-token');
      expect(service).toBeInstanceOf(TwitterService);
    });

    test('throws error when TwitterService created without token', () => {
      expect(() => new TwitterService()).toThrow('Twitter Bearer Token is required');
    });
  });

  describe('extractTweetId', () => {
    let service;

    beforeEach(() => {
      service = new TwitterService('test-token');
    });

    test('extracts tweet ID from twitter.com URL', () => {
      const id = service.extractTweetId('https://twitter.com/user/status/1234567890');
      expect(id).toBe('1234567890');
    });

    test('extracts tweet ID from x.com URL', () => {
      const id = service.extractTweetId('https://x.com/user/status/9876543210');
      expect(id).toBe('9876543210');
    });

    test('returns null for invalid URLs', () => {
      const id = service.extractTweetId('https://example.com/article');
      expect(id).toBeNull();
    });

    test('handles URLs with query parameters', () => {
      const id = service.extractTweetId('https://twitter.com/user/status/123456?ref=share');
      expect(id).toBe('123456');
    });
  });

  describe('fetchTweet', () => {
    let service;

    beforeEach(() => {
      service = new TwitterService('test-token');
    });

    test('fetches single tweet with metadata', async () => {
      const mockTweet = {
        data: {
          id: '123',
          text: 'Test tweet',
          created_at: '2025-01-01T12:00:00Z',
          author_id: '456',
          conversation_id: '123',
          public_metrics: {
            like_count: 10,
            retweet_count: 5,
            reply_count: 2
          }
        },
        includes: {
          users: [{
            id: '456',
            name: 'Test User',
            username: 'testuser',
            verified: true
          }]
        }
      };

      mockSingleTweet.mockResolvedValue(mockTweet);

      const result = await service.fetchTweet('123');

      expect(mockSingleTweet).toHaveBeenCalledWith('123', expect.any(Object));
      expect(result).toEqual(mockTweet);
    });

    test('handles API errors', async () => {
      mockSingleTweet.mockRejectedValue(new Error('API Error'));

      await expect(service.fetchTweet('123')).rejects.toThrow('API Error');
    });
  });

  describe('fetchThread', () => {
    let service;

    beforeEach(() => {
      service = new TwitterService('test-token');
    });

    test('fetches single tweet when no thread exists', async () => {
      const mockTweet = {
        data: {
          id: '123',
          text: 'Single tweet',
          created_at: '2025-01-01T12:00:00Z',
          author_id: '456',
          conversation_id: '123'
        },
        includes: {
          users: [{
            id: '456',
            name: 'Test User',
            username: 'testuser'
          }]
        }
      };

      mockSingleTweet.mockResolvedValue(mockTweet);
      mockSearch.mockResolvedValue({
        data: { data: [] }
      });

      const result = await service.fetchThread('123');

      expect(result.tweets).toHaveLength(1);
      expect(result.tweets[0].id).toBe('123');
      expect(result.author.username).toBe('testuser');
    });

    test('fetches complete thread', async () => {
      const mainTweet = {
        data: {
          id: '123',
          text: 'First tweet',
          created_at: '2025-01-01T12:00:00Z',
          author_id: '456',
          conversation_id: '123'
        },
        includes: {
          users: [{
            id: '456',
            name: 'Test User',
            username: 'testuser'
          }]
        }
      };

      const threadTweets = {
        data: {
          data: [
            {
              id: '123',
              text: 'First tweet',
              created_at: '2025-01-01T12:00:00Z',
              author_id: '456'
            },
            {
              id: '124',
              text: 'Second tweet',
              created_at: '2025-01-01T12:01:00Z',
              author_id: '456'
            },
            {
              id: '125',
              text: 'Third tweet',
              created_at: '2025-01-01T12:02:00Z',
              author_id: '456'
            }
          ]
        }
      };

      mockSingleTweet.mockResolvedValue(mainTweet);
      mockSearch.mockResolvedValue(threadTweets);

      const result = await service.fetchThread('123');

      expect(result.tweets).toHaveLength(3);
      expect(result.tweets[0].text).toBe('First tweet');
      expect(result.tweets[2].text).toBe('Third tweet');
    });

    test('sorts tweets chronologically', async () => {
      const mainTweet = {
        data: {
          id: '123',
          text: 'First',
          created_at: '2025-01-01T12:00:00Z',
          author_id: '456',
          conversation_id: '123'
        },
        includes: { users: [{ id: '456', name: 'User', username: 'user' }] }
      };

      const threadTweets = {
        data: {
          data: [
            { id: '125', text: 'Third', created_at: '2025-01-01T12:02:00Z', author_id: '456' },
            { id: '123', text: 'First', created_at: '2025-01-01T12:00:00Z', author_id: '456' },
            { id: '124', text: 'Second', created_at: '2025-01-01T12:01:00Z', author_id: '456' }
          ]
        }
      };

      mockSingleTweet.mockResolvedValue(mainTweet);
      mockSearch.mockResolvedValue(threadTweets);

      const result = await service.fetchThread('123');

      expect(result.tweets[0].text).toBe('First');
      expect(result.tweets[1].text).toBe('Second');
      expect(result.tweets[2].text).toBe('Third');
    });
  });

  describe('convertToMarkdown', () => {
    let service;

    beforeEach(() => {
      service = new TwitterService('test-token');
    });

    test('converts single tweet to markdown', () => {
      const threadData = {
        tweets: [{
          id: '123',
          text: 'This is a test tweet',
          created_at: '2025-01-01T12:00:00Z',
          public_metrics: {
            reply_count: 5,
            retweet_count: 10,
            like_count: 20,
            impression_count: 1000
          }
        }],
        author: {
          name: 'Test User',
          username: 'testuser',
          verified: true
        }
      };

      const markdown = service.convertToMarkdown(threadData, 'https://twitter.com/testuser/status/123');

      expect(markdown).toContain('# Tweet by @testuser');
      expect(markdown).toContain('Test User (@testuser) ✓');
      expect(markdown).toContain('This is a test tweet');
      expect(markdown).toContain('Replies: 5');
      expect(markdown).toContain('Retweets: 10');
      expect(markdown).toContain('Likes: 20');
    });

    test('converts thread to markdown with numbering', () => {
      const threadData = {
        tweets: [
          {
            id: '123',
            text: 'First tweet',
            created_at: '2025-01-01T12:00:00Z',
            public_metrics: { reply_count: 1, retweet_count: 2, like_count: 3 }
          },
          {
            id: '124',
            text: 'Second tweet',
            created_at: '2025-01-01T12:01:00Z',
            public_metrics: { reply_count: 4, retweet_count: 5, like_count: 6 }
          }
        ],
        author: {
          name: 'Test User',
          username: 'testuser',
          verified: false
        }
      };

      const markdown = service.convertToMarkdown(threadData, 'https://twitter.com/testuser/status/123');

      expect(markdown).toContain('# Twitter Thread by @testuser');
      expect(markdown).toContain('**Tweets:** 2');
      expect(markdown).toContain('### 1/2');
      expect(markdown).toContain('First tweet');
      expect(markdown).toContain('### 2/2');
      expect(markdown).toContain('Second tweet');
    });

    test('includes engagement metrics for threads', () => {
      const threadData = {
        tweets: [
          {
            id: '123',
            text: 'First tweet',
            created_at: '2025-01-01T12:00:00Z',
            public_metrics: { reply_count: 10, retweet_count: 20, like_count: 30 }
          },
          {
            id: '124',
            text: 'Second tweet',
            created_at: '2025-01-01T12:01:00Z',
            public_metrics: { reply_count: 5, retweet_count: 10, like_count: 15 }
          }
        ],
        author: { name: 'User', username: 'user', verified: false }
      };

      const markdown = service.convertToMarkdown(threadData, 'https://twitter.com/user/status/123');

      expect(markdown).toContain('💬 10');
      expect(markdown).toContain('🔁 20');
      expect(markdown).toContain('❤️ 30');
    });
  });

  describe('urlToMarkdown', () => {
    let service;

    beforeEach(() => {
      service = new TwitterService('test-token');
    });

    test('extracts and converts complete tweet', async () => {
      const mockTweet = {
        data: {
          id: '123',
          text: 'Test tweet',
          created_at: '2025-01-01T12:00:00Z',
          author_id: '456',
          conversation_id: '123',
          public_metrics: { reply_count: 1, retweet_count: 2, like_count: 3 }
        },
        includes: {
          users: [{ id: '456', name: 'User', username: 'user', verified: false }]
        }
      };

      mockSingleTweet.mockResolvedValue(mockTweet);
      mockSearch.mockResolvedValue({ data: { data: [] } });

      const markdown = await service.urlToMarkdown('https://twitter.com/user/status/123');

      expect(markdown).toContain('Test tweet');
      expect(markdown).toContain('@user');
    });

    test('throws error for invalid URLs', async () => {
      await expect(
        service.urlToMarkdown('https://example.com/not-a-tweet')
      ).rejects.toThrow('Could not extract tweet ID from URL');
    });
  });
});
