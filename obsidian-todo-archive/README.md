# Obsidian Todo Archive

A TypeScript tool that archives Obsidian todo lists with timestamps and preserves incomplete tasks for the next session.

## Features

- ✅ Archives complete todo list to a timestamped file
- ✅ Preserves incomplete tasks in the current todo file
- ✅ Adds a link to the archive in the new todo file
- ✅ Prevents overwriting existing archives
- ✅ Supports any markdown todo format (checked `[x]` and unchecked `[ ]`)
- ✅ Written in TypeScript with full type safety
- ✅ Comprehensive test suite

## Installation

```bash
cd obsidian-todo-archive
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
   ARCHIVE_PREFIX=todo-archive
   ```

## Usage

### Basic Usage

Run the script to archive your todo list:

```bash
npm start
```

The script will:
1. Read your current todo list file (`notes/todo.md` by default)
2. Archive the entire content to a timestamped file (e.g., `todo-archive-2026-01-01.md`)
3. Create a new todo file with:
   - A link to the archive
   - A "Previously on tasks" section containing all incomplete tasks

### Example

**Before** (`notes/todo.md`):
```markdown
2025-10-11
- [[Project Alpha]]
- [ ] Schedule team meeting #work/projects
- [x] Complete documentation update ✅ 2025-10-24
- [x] Review pull requests #work/code-review ✅ 2025-10-24
- [x] Fix authentication bug

2025-10-12
- [x] Update dependencies
- [x] Refactor user module

2025-01-23
- [ ] Prepare quarterly report #work/admin
- [ ] Write article on [[Software Architecture]] #personal/blog
```

**After running the script:**

`notes/todo.md`:
```markdown
# Archive

Previous todo list archived to: [[todo-archive-2026-01-01]]

# Previously on tasks

- [ ] Schedule team meeting #work/projects
- [ ] Prepare quarterly report #work/admin
- [ ] Write article on [[Software Architecture]] #personal/blog
```

Archive created:
- `notes/todo-archive-2026-01-01.md` → contains the complete original todo list

## How It Works

1. **Reading**: The script reads your current todo file
2. **Archiving**: Creates a copy with today's date (format: `ARCHIVE_PREFIX-YYYY-MM-DD.md`)
3. **Extraction**: Identifies all incomplete tasks (lines with `- [ ]`)
4. **Rewriting**: Replaces the todo file with:
   - A reference to the archive
   - All incomplete tasks under "Previously on tasks"

## Script Behavior

- Archives are created with today's date in YYYY-MM-DD format
- Only processes lines that are todo items (start with `- [ ]` or `- [x]`)
- Preserves the exact format of incomplete tasks (including tags, dates, links)
- Won't overwrite existing archives (exits with error if archive exists)
- Handles any markdown todo format supported by Obsidian

## Archive Filename Format

The script generates archive filenames using the pattern:
```
{ARCHIVE_PREFIX}-{YYYY-MM-DD}.md
```

Examples:
- `todo-archive-2026-01-01.md`
- `todo-archive-2026-12-31.md`

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

- **Daily Review**: Archive yesterday's todos and start fresh with incomplete tasks
- **Weekly Planning**: Clear completed tasks while preserving what's left to do
- **Project Tracking**: Maintain a history of your todo lists over time
- **Progress Monitoring**: Review archives to see what you've accomplished

## License

MIT
