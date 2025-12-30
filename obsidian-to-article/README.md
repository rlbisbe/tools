# Obsidian to Article Converter

Convert Obsidian notes containing URLs into full-length Markdown articles using Google's Gemini API (direct API integration or CLI tools).

## Features

- ✅ Extracts URLs from Obsidian notes (plain URLs and markdown links)
- ✅ Fetches HTML content from web pages
- ✅ **Intelligently extracts core article content** using Gemini API (direct API or CLI)
- ✅ **API-first architecture** - uses Google Generative AI SDK for better performance
- ✅ Removes ads, navigation, sidebars, and page clutter
- ✅ Preserves article structure, code blocks, images, and links
- ✅ **In-place URL replacement** - replaces URLs with full content directly in source files
- ✅ **Twitter/X integration** - extracts tweets and threads using Twitter API
- ✅ **Dry-run mode** - preview results without writing files
- ✅ Converts YouTube and Instagram URLs (coming soon)
- ✅ Mock mode for testing without API key
- ✅ Batch processing of multiple notes
- ✅ **Interactive setup wizard** - easy configuration with guided prompts

## Quick Start

Get started in 3 simple steps:

```bash
# 1. Install dependencies
npm install

# 2. Run the interactive setup wizard
npm run setup

# 3. Add your notes and start converting
npm start
```

The setup wizard will guide you through all configuration options!

## Installation

1. Navigate to the project directory:
```bash
cd obsidian-to-article
```

2. Install dependencies:
```bash
npm install
```

3. Run the interactive setup wizard:
```bash
npm run setup
```

The setup wizard will guide you through:
- Configuring Gemini API (mock or real)
- Setting up Twitter API (optional)
- Choosing input/output directories
- Enabling/disabling dry-run and auto-cleanup features

**Alternative:** Manual setup by copying `.env.example` to `.env`:
```bash
cp .env.example .env
```

Then edit `.env` file with your configuration:
```env
# Service type: 'api' (recommended), 'cli', or 'mock'
LLM_SERVICE_TYPE=api

# For API-based service (recommended)
GEMINI_API_KEY=your_actual_api_key_here
GEMINI_MODEL=gemini-1.5-flash

# For testing with mock service (no API key needed)
# LLM_SERVICE_TYPE=mock

# For CLI-based service (legacy)
# LLM_SERVICE_TYPE=cli
# CLI_COMMAND=gemini
# CLI_TOOL_TYPE=gemini
```

## Getting a Gemini API Key

To use the real Gemini API (not mock):

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy your API key
5. Add it to your `.env` file:
   ```env
   GEMINI_API_KEY=your_api_key_here
   USE_MOCK_GEMINI=false
   ```

## Getting a Twitter API Bearer Token

To enable Twitter/X URL support (optional):

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Sign in with your Twitter/X account
3. Create a new project and app (or use an existing one)
4. Navigate to your app's "Keys and tokens" section
5. Generate a "Bearer Token" under "Authentication Tokens"
6. Copy the Bearer Token
7. Add it to your `.env` file:
   ```env
   TWITTER_BEARER_TOKEN=your_bearer_token_here
   ```

**Note:** Twitter API v2 has a free tier that's sufficient for personal use. Without a bearer token, Twitter/X URLs will be skipped.

## Directory Structure

```
obsidian-to-article/
├── index.js              # Main script
├── llmService.js         # Base LLM service interface
├── geminiApiService.js   # Gemini API service (using Google SDK)
├── geminiService.js      # CLI-based and mock services
├── twitterService.js     # Twitter API service for tweets/threads
├── utils.js              # Utility functions
├── logger.js             # Logging service
├── package.json          # Dependencies
├── .env.example          # Environment variables template
├── .env                  # Your environment variables (create this)
└── notes/                # Input: Place your Obsidian notes here
```

## Usage

1. Create the `notes` directory and add your Obsidian notes:
```bash
mkdir notes
```

2. Add markdown files with URLs to the `notes` directory. Example note:
```markdown
# Article to Read

https://example.com/interesting-article

This looks interesting!
```

3. Run the converter:
```bash
npm start
```

Or directly:
```bash
node index.js
```

4. Check your notes - the URLs will be replaced with full article content directly in your source files.

## How It Works

1. **Reads Obsidian Notes**: Scans all `.md` files in the `notes` directory
2. **Extracts URLs**: Finds all URLs (plain and markdown-style links)
3. **Categorizes URLs**: Identifies Twitter/X, YouTube, Instagram, and regular web URLs
4. **Processes Based on Type**:
   - **Twitter/X**: Uses Twitter API to fetch tweet/thread data
   - **Web Articles**: Downloads HTML and uses Gemini AI to extract core content
   - **YouTube/Instagram**: Currently skipped (coming soon)
5. **Extracts Core Content**: Removes navigation, ads, sidebars, and other clutter
6. **Converts to Markdown**: Transforms the clean content into well-formatted Markdown
7. **Replaces In-Place**: Replaces URLs with expanded content directly in the source files

## Supported Platforms

- ✅ **Regular Web Articles**: Any standard website (news sites, blogs, etc.)
- ✅ **Twitter/X**: Individual tweets and full threads (requires API token)
- ⏳ **YouTube**: Coming soon (video transcripts)
- ⏳ **Instagram**: Coming soon

URLs from YouTube and Instagram are currently skipped.

## Service Types

### API Mode (Recommended, Default)
- Uses Google's Generative AI SDK for direct API calls
- Fastest and most efficient
- No CLI dependencies needed
- Requires API key (free tier available)
- Intelligently removes ads, navigation, sidebars, and clutter
- Focuses on main article body, headings, and relevant media
- Preserves important content: code blocks, quotes, lists, links
- Skips comments, related articles, and promotional content
- Better at identifying and extracting the actual article vs. page chrome

### CLI Mode (Legacy)
- Uses external CLI tools (gemini-cli, kiro, claude)
- Requires CLI tool to be installed
- Same AI quality as API mode but slower
- Useful if you already have CLI tools configured

### Mock Mode (Testing)
- Uses local HTML-to-Markdown conversion with Cheerio
- No API key or CLI tool required
- Great for testing and development
- Basic Markdown conversion
- Simple content extraction

## Configuration

You can customize the behavior via `.env` file:

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_SERVICE_TYPE` | Service type: 'api', 'cli', or 'mock' | `api` |
| `GEMINI_API_KEY` | Your Gemini API key (for API service) | - |
| `GEMINI_MODEL` | Gemini model name | `gemini-1.5-flash` |
| `CLI_COMMAND` | CLI command (for CLI service, legacy) | `gemini` |
| `CLI_TOOL_TYPE` | CLI tool type: gemini/kiro/claude (legacy) | `gemini` |
| `USE_MOCK_GEMINI` | Use mock service (overrides LLM_SERVICE_TYPE) | `false` |
| `TWITTER_BEARER_TOKEN` | Your Twitter API Bearer Token (optional) | - |
| `OBSIDIAN_NOTES_PATH` | Directory containing your notes | `./notes` |
| `DRY_RUN` | Preview results without modifying files | `false` |

### Advanced Features

**Dry-Run Mode** (`DRY_RUN=true`)
- Preview what would be converted without actually modifying files
- Shows the first 500 characters of each converted article
- Doesn't modify source files
- Useful for testing before committing to conversions

## Example

**Input** (`notes/article.md`):
```markdown
# Interesting Reads

Check this out: https://example.com/article

Great Twitter thread: https://twitter.com/username/status/1234567890

[Another great read](https://example.com/another-article)

This YouTube video is cool: https://youtube.com/watch?v=xyz
```

**After Processing** (`notes/article.md`):
```markdown
# Interesting Reads

Check this out: 

---

# Article Content

[Full article content from example.com/article]

---

Great Twitter thread: 

---

# Twitter Thread

[Formatted Twitter thread content]

---

---

# Another great read

[Full article content from example.com/another-article]

---

This YouTube video is cool: https://youtube.com/watch?v=xyz
```

Note: YouTube link remains unchanged (coming soon)

## Development & Testing

### Running Tests

The project includes comprehensive unit and integration tests using Jest.

**Install dependencies** (first time only):
```bash
cd obsidian-to-article
npm install
```

**Run all tests**:
```bash
npm test
```

**Run tests in watch mode** (for development):
```bash
npm run test:watch
```

**Run tests with coverage**:
```bash
npm run test:coverage
```

### Test Structure

- `__tests__/utils.test.js` - Tests for URL extraction and utility functions
- `__tests__/geminiService.test.js` - Tests for Gemini API service (with mocks)
- `__tests__/twitterService.test.js` - Tests for Twitter API service (with mocks)
- `__tests__/integration.test.js` - Integration tests for the complete workflow

### Continuous Integration

The project uses GitHub Actions to automatically run tests on:
- Every push to main/master branch
- Every pull request
- Tests run on Node.js 18.x and 20.x

See `.github/workflows/test.yml` for the CI configuration.

## Troubleshooting

### "No URLs found in this note"
- Make sure your note contains valid URLs
- URLs should be in the format `http://` or `https://`

### "GEMINI_API_KEY is required"
- Either set `USE_MOCK_GEMINI=true` in `.env`
- Or add your Gemini API key to `.env`

### "Notes directory not found"
- Create the `notes` directory: `mkdir notes`
- Add your Obsidian note files

### Network Errors
- Check your internet connection
- Some websites may block automated access
- Try adding a delay between requests

## License

MIT

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.
