# Obsidian URL Extractor

A TypeScript tool that extracts URLs from Obsidian todo lists, creates individual notes for each URL, and removes the processed items from the original list.

## Features

- ✅ Extracts URLs from todo items (both checked and unchecked)
- ✅ Supports plain URLs and markdown-style links `[text](url)`
- ✅ Creates individual notes with the URL as content
- ✅ Automatically removes processed todo items from the original list
- ✅ Prevents duplicate note creation
- ✅ Generates clean, readable filenames from URLs
- ✅ Written in TypeScript with full type safety
- ✅ Comprehensive test suite

## Installation

```bash
cd obsidian-url-extractor
npm install
npm run build
```

## Configuration

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` to configure your paths:
   ```bash
   OBSIDIAN_NOTES_PATH=./notes
   TODO_FILE=todo.md
   ```

## Usage

### Basic Usage

Run the script to process your todo list:

```bash
npm start
```

The script will:
1. Read your todo list file (`notes/todo.md` by default)
2. Find all todo items containing URLs
3. Create a new note for each URL
4. Remove the processed todo items from the original list

### Example

**Before** (`notes/todo.md`):
```markdown
# My Todo List

- [ ] https://example.com/article1
- [ ] [Interesting Article](https://example.com/article2)
- [ ] Buy groceries
- [ ] https://github.com/example/repo
```

**After running the script:**

`notes/todo.md`:
```markdown
# My Todo List

- [ ] Buy groceries
```

New files created:
- `notes/example-com-article1.md` → contains `https://example.com/article1`
- `notes/example-com-article2.md` → contains `https://example.com/article2`
- `notes/github-com-example-repo.md` → contains `https://github.com/example/repo`

## How It Works

1. **URL Detection**: The script scans each line in your todo list for:
   - Plain URLs: `https://example.com`
   - Markdown links: `[text](https://example.com)`

2. **Note Creation**: For each URL found:
   - Generates a unique filename based on the URL
   - Creates a new markdown file containing only the URL
   - Skips creation if a note with that name already exists

3. **List Cleanup**: Removes todo items containing URLs from the original list

4. **Preservation**: Keeps all other todo items and non-todo content intact

## Script Behavior

- Only processes lines that are todo items (start with `- [ ]` or `- [x]`)
- Supports both unchecked `- [ ]` and checked `- [x]` todo items
- Preserves all non-URL todo items and regular content
- Won't create duplicate notes (checks if file already exists)
- Handles multiple URLs per todo item

## Example Todo List Format

```markdown
# Articles to Read

- [ ] https://example.com/article1
- [ ] [Great Article](https://blog.example.com/post)
- [ ] Read this: https://news.site.com/story
- [x] Already read https://completed.com/article

# Regular Tasks

- [ ] Buy groceries
- [ ] Call dentist
```

## Filename Generation

The script generates clean filenames from URLs:

- `https://example.com/article` → `example-com-article.md`
- `https://blog.site.com/2024/post` → `blog-site-com-post.md`
- `https://github.com/user/repo` → `github-com-user-repo.md`

Filenames are:
- Lowercase
- Limited to 80 characters
- Use hyphens instead of special characters
- Include both domain and path for uniqueness

## Requirements

- Node.js 18+ (for ES modules and TypeScript support)
- npm or yarn
- TypeScript 5.3+

## Development

### Building

The project is written in TypeScript and must be compiled before running:

```bash
npm run build
```

This compiles TypeScript files from `src/` to JavaScript in `dist/`.

### Development Mode

For rapid development, use the dev script which runs TypeScript directly:

```bash
npm run dev
```

### Running Tests

```bash
npm test
```

Tests are written in TypeScript and run using ts-jest.

### Watch Mode

```bash
npm run test:watch
```

### Coverage

```bash
npm run test:coverage
```

### Clean Build Artifacts

```bash
npm run clean
```

## Use Cases

- **Reading List Management**: Extract article URLs from your todo list into individual notes for later processing
- **Link Organization**: Convert a list of URLs into separate notes for annotation
- **Workflow Automation**: Batch process URLs before feeding them to other tools
- **Knowledge Management**: Separate URL collection from URL processing in your Obsidian vault

## License

MIT
