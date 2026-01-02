# tools
A list of small tools for personal productivity

## Available Tools

### 1. Obsidian URL Extractor
Extract URLs from Obsidian todo lists and create individual notes for each URL.

**Location:** `obsidian-url-extractor/`

**Technology:** TypeScript

**Features:**
- Extracts URLs from todo items (both plain URLs and markdown links)
- Creates individual notes with URLs as content
- Removes processed items from the original todo list
- Prevents duplicate note creation
- Full type safety with TypeScript

**Quick Start:**
```bash
cd obsidian-url-extractor
npm install
npm run build
cp .env.example .env
# Edit .env with your paths
npm start
```

[Full Documentation](./obsidian-url-extractor/README.md)

### 2. Obsidian to Article Converter
Convert Obsidian notes containing URLs into full-length articles using Gemini API.

**Location:** `obsidian-to-article/`

**Features:**
- Converts web articles to markdown using Google's Gemini API
- Integrates with Twitter API for thread extraction
- Batch processes multiple notes
- Intelligent URL filtering

**Quick Start:**
```bash
cd obsidian-to-article
npm install
cp .env.example .env
# Add your GEMINI_API_KEY
npm start
```

[Full Documentation](./obsidian-to-article/README.md)

### 3. Obsidian Todo Archive
Archive Obsidian todo lists with timestamps and preserve incomplete tasks for the next session.

**Location:** `obsidian-todo-archive/`

**Technology:** TypeScript

**Features:**
- Archives complete todo list to a timestamped file
- Preserves incomplete tasks in the current todo file
- Adds a link to the archive in the new todo file
- Prevents overwriting existing archives
- Supports any markdown todo format
- Full type safety with TypeScript

**Quick Start:**
```bash
cd obsidian-todo-archive
npm install
npm run build
cp .env.example .env
# Edit .env with your paths
npm start
```

[Full Documentation](./obsidian-todo-archive/README.md)

## Workflow Suggestion

These tools work well together:
1. Use **Obsidian URL Extractor** to organize URLs from your todo list into individual notes
2. Use **Obsidian to Article Converter** to transform those URL notes into full articles
3. Use **Obsidian Todo Archive** to archive completed tasks and start fresh with incomplete ones

## Contributing

Feel free to add more productivity tools to this repository! 
