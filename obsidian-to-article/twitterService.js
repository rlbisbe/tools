import { TwitterApi } from 'twitter-api-v2';

/**
 * Twitter service for extracting tweets and threads
 */
export class TwitterService {
  constructor(bearerToken) {
    if (!bearerToken) {
      throw new Error('Twitter Bearer Token is required');
    }
    this.client = new TwitterApi(bearerToken);
    this.readOnlyClient = this.client.readOnly;
  }

  /**
   * Extract tweet ID from various Twitter URL formats
   */
  extractTweetId(url) {
    const patterns = [
      /twitter\.com\/\w+\/status\/(\d+)/,
      /x\.com\/\w+\/status\/(\d+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Fetch a single tweet with all metadata
   */
  async fetchTweet(tweetId) {
    try {
      const tweet = await this.readOnlyClient.v2.singleTweet(tweetId, {
        'tweet.fields': [
          'created_at',
          'public_metrics',
          'author_id',
          'conversation_id',
          'referenced_tweets'
        ],
        'user.fields': ['name', 'username', 'verified'],
        'expansions': ['author_id', 'referenced_tweets.id']
      });

      return tweet;
    } catch (error) {
      console.error('Error fetching tweet:', error.message);
      throw error;
    }
  }

  /**
   * Fetch a full thread starting from a tweet
   */
  async fetchThread(tweetId) {
    try {
      const mainTweet = await this.fetchTweet(tweetId);
      const tweets = [mainTweet.data];

      // Get the conversation ID to fetch all tweets in the thread
      const conversationId = mainTweet.data.conversation_id;
      const authorId = mainTweet.data.author_id;

      // Search for all tweets in this conversation by the same author
      const threadTweets = await this.readOnlyClient.v2.search(
        `conversation_id:${conversationId} from:${authorId}`,
        {
          'tweet.fields': ['created_at', 'public_metrics', 'author_id'],
          'max_results': 100
        }
      );

      // Add all thread tweets (excluding the main tweet we already have)
      if (threadTweets.data && threadTweets.data.data) {
        const additionalTweets = threadTweets.data.data.filter(
          t => t.id !== tweetId
        );
        tweets.push(...additionalTweets);
      }

      // Sort by creation date
      tweets.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

      return {
        tweets,
        author: mainTweet.includes?.users?.[0],
        conversationId
      };

    } catch (error) {
      console.error('Error fetching thread:', error.message);
      // If thread fetching fails, just return the single tweet
      const mainTweet = await this.fetchTweet(tweetId);
      return {
        tweets: [mainTweet.data],
        author: mainTweet.includes?.users?.[0],
        conversationId: mainTweet.data.conversation_id
      };
    }
  }

  /**
   * Convert tweet(s) to Markdown format
   */
  convertToMarkdown(threadData, url) {
    const { tweets, author } = threadData;
    const isThread = tweets.length > 1;

    let markdown = '';

    // Title
    if (isThread) {
      markdown += `# Twitter Thread by @${author.username}\n\n`;
    } else {
      markdown += `# Tweet by @${author.username}\n\n`;
    }

    // Metadata
    markdown += `**Author:** ${author.name} (@${author.username})${author.verified ? ' ✓' : ''}\n`;
    markdown += `**Date:** ${new Date(tweets[0].created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })}\n`;
    markdown += `**Source:** ${url}\n`;

    if (isThread) {
      markdown += `**Tweets:** ${tweets.length}\n`;
    }

    markdown += `\n---\n\n`;

    // Tweet content
    if (isThread) {
      tweets.forEach((tweet, index) => {
        markdown += `### ${index + 1}/${tweets.length}\n\n`;
        markdown += `${tweet.text}\n\n`;

        // Add metrics for context
        if (tweet.public_metrics) {
          const metrics = tweet.public_metrics;
          markdown += `*💬 ${metrics.reply_count} · 🔁 ${metrics.retweet_count} · ❤️ ${metrics.like_count}*\n\n`;
        }
      });
    } else {
      markdown += `${tweets[0].text}\n\n`;

      // Add metrics
      if (tweets[0].public_metrics) {
        const metrics = tweets[0].public_metrics;
        markdown += `\n---\n\n`;
        markdown += `**Engagement:**\n`;
        markdown += `- Replies: ${metrics.reply_count}\n`;
        markdown += `- Retweets: ${metrics.retweet_count}\n`;
        markdown += `- Likes: ${metrics.like_count}\n`;
        markdown += `- Views: ${metrics.impression_count || 'N/A'}\n`;
      }
    }

    return markdown;
  }

  /**
   * Main method to convert a Twitter URL to Markdown
   */
  async urlToMarkdown(url) {
    const tweetId = this.extractTweetId(url);

    if (!tweetId) {
      throw new Error('Could not extract tweet ID from URL');
    }

    console.log(`  📱 Fetching tweet/thread: ${tweetId}`);

    const threadData = await this.fetchThread(tweetId);

    console.log(`  📝 Found ${threadData.tweets.length} tweet(s)`);

    return this.convertToMarkdown(threadData, url);
  }
}

/**
 * Create Twitter service instance
 */
export function createTwitterService(bearerToken) {
  if (!bearerToken) {
    return null;
  }
  return new TwitterService(bearerToken);
}
