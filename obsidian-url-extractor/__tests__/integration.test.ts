import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

describe('URL Extractor Integration', () => {
  const testDir = path.join(process.cwd(), '__tests__', 'test-workspace');
  const notesDir = path.join(testDir, 'notes');
  const todoFile = path.join(notesDir, 'todo.md');
  const scriptPath = path.join(process.cwd(), 'dist', 'index.js');

  beforeEach(async () => {
    // Create test workspace
    await fs.mkdir(notesDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test workspace
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('extracts URLs and creates notes', async () => {
    // Create a test todo file
    const todoContent = `# Test Todo List

- [ ] https://example.com/article1
- [ ] [Article 2](https://example.com/article2)
- [ ] Regular task without URL
- [ ] https://github.com/test/repo

## Other tasks
- [ ] Buy groceries
`;

    await fs.writeFile(todoFile, todoContent, 'utf-8');

    // Run the script
    await execFileAsync('node', [scriptPath], {
      env: {
        ...process.env,
        OBSIDIAN_NOTES_PATH: notesDir,
        TODO_FILE: 'todo.md'
      }
    });

    // Check that notes were created
    const files = await fs.readdir(notesDir);
    const mdFiles = files.filter(f => f.endsWith('.md') && f !== 'todo.md');

    expect(mdFiles.length).toBeGreaterThanOrEqual(2);
    expect(mdFiles).toContain('example-com-article1.md');
    expect(mdFiles).toContain('example-com-article2.md');

    // Check note content
    const note1Content = await fs.readFile(
      path.join(notesDir, 'example-com-article1.md'),
      'utf-8'
    );
    expect(note1Content).toContain('https://example.com/article1');

    // Check that todo file was updated
    const updatedTodo = await fs.readFile(todoFile, 'utf-8');
    expect(updatedTodo).not.toContain('https://example.com/article1');
    expect(updatedTodo).not.toContain('https://example.com/article2');
    expect(updatedTodo).toContain('Regular task without URL');
    expect(updatedTodo).toContain('Buy groceries');
  });

  test('handles empty todo list', async () => {
    const todoContent = `# Empty List

- [ ] No URLs here
- [ ] Just tasks
`;

    await fs.writeFile(todoFile, todoContent, 'utf-8');

    // Run the script - should not throw
    await expect(
      execFileAsync('node', [scriptPath], {
        env: {
          ...process.env,
          OBSIDIAN_NOTES_PATH: notesDir,
          TODO_FILE: 'todo.md'
        }
      })
    ).resolves.toBeDefined();

    // Check that no extra notes were created
    const files = await fs.readdir(notesDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    expect(mdFiles).toEqual(['todo.md']);
  });

  test('does not create duplicate notes', async () => {
    const todoContent = `- [ ] https://example.com/article1
- [ ] https://example.com/article1
`;

    await fs.writeFile(todoFile, todoContent, 'utf-8');

    // Pre-create one of the notes
    await fs.writeFile(
      path.join(notesDir, 'example-com-article1.md'),
      'https://example.com/article1\n',
      'utf-8'
    );

    // Run the script
    await execFileAsync('node', [scriptPath], {
      env: {
        ...process.env,
        OBSIDIAN_NOTES_PATH: notesDir,
        TODO_FILE: 'todo.md'
      }
    });

    // Check that only one note exists
    const files = await fs.readdir(notesDir);
    const articleFiles = files.filter(f => f.startsWith('example-com-article1'));
    expect(articleFiles).toHaveLength(1);
  });
});
