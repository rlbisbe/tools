import fs from 'fs/promises';
import path from 'path';
import { archiveTodoFile } from '../src/index.js';

describe('Todo Archive Integration', () => {
  const testWorkspace = path.join(__dirname, 'test-workspace');
  const todoPath = path.join(testWorkspace, 'todo.md');

  beforeAll(async () => {
    // Clean up any existing test workspace before all tests
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clean up and recreate test workspace for each test
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    await fs.mkdir(testWorkspace, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test workspace
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  afterAll(async () => {
    // Final cleanup after all tests
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('archives todo file and preserves incomplete tasks', async () => {
    // Create a test todo file
    const todoContent = `2025-10-11
- [[Project Alpha]]
- [ ] Schedule team meeting #work/projects
- [x] Complete documentation update ✅ 2025-10-24
- [x] Review pull requests #work/code-review ✅ 2025-10-24

2025-10-12
- [x] Update dependencies
- [x] Fix bug in authentication module

2025-01-23
- [ ] Prepare quarterly report #work/admin
- [ ] Write article on [[Software Architecture]] #personal/blog`;

    await fs.writeFile(todoPath, todoContent, 'utf-8');

    // Archive the todo file
    const result = await archiveTodoFile(todoPath, testWorkspace, 'todo-archive');

    // Check the result
    expect(result.totalTasks).toBe(7);
    expect(result.completedTasks).toBe(4);
    expect(result.incompleteTasks).toHaveLength(3);
    expect(result.archiveFilename).toMatch(/^todo-archive-\d{4}-\d{2}-\d{2}\.md$/);

    // Check that archive file was created
    const archivePath = path.join(testWorkspace, result.archiveFilename);
    const archiveContent = await fs.readFile(archivePath, 'utf-8');
    expect(archiveContent).toBe(todoContent);

    // Check that todo file was updated
    const newTodoContent = await fs.readFile(todoPath, 'utf-8');
    expect(newTodoContent).toContain('# Archive');
    expect(newTodoContent).toContain('Previous todo list archived to:');
    expect(newTodoContent).toContain('# Previously on tasks');
    expect(newTodoContent).toContain('- [ ] Schedule team meeting #work/projects');
    expect(newTodoContent).toContain('- [ ] Prepare quarterly report #work/admin');
    expect(newTodoContent).toContain('- [ ] Write article on [[Software Architecture]] #personal/blog');

    // Ensure completed tasks are not in the new todo file
    expect(newTodoContent).not.toContain('- [x] Complete documentation update');
    expect(newTodoContent).not.toContain('- [x] Update dependencies');
  });

  test('handles todo file with no incomplete tasks', async () => {
    const todoContent = `2025-10-11
- [x] Task 1
- [x] Task 2
- [x] Task 3`;

    await fs.writeFile(todoPath, todoContent, 'utf-8');

    const result = await archiveTodoFile(todoPath, testWorkspace, 'todo-archive');

    expect(result.totalTasks).toBe(3);
    expect(result.completedTasks).toBe(3);
    expect(result.incompleteTasks).toHaveLength(0);

    // Check that todo file doesn't have "Previously on tasks" section
    const newTodoContent = await fs.readFile(todoPath, 'utf-8');
    expect(newTodoContent).toContain('# Archive');
    expect(newTodoContent).toContain('Previous todo list archived to:');
    expect(newTodoContent).not.toContain('# Previously on tasks');
  });

  test('handles todo file with only incomplete tasks', async () => {
    const todoContent = `2025-10-11
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3`;

    await fs.writeFile(todoPath, todoContent, 'utf-8');

    const result = await archiveTodoFile(todoPath, testWorkspace, 'todo-archive');

    expect(result.totalTasks).toBe(3);
    expect(result.completedTasks).toBe(0);
    expect(result.incompleteTasks).toHaveLength(3);

    const newTodoContent = await fs.readFile(todoPath, 'utf-8');
    expect(newTodoContent).toContain('# Previously on tasks');
    expect(newTodoContent).toContain('- [ ] Task 1');
    expect(newTodoContent).toContain('- [ ] Task 2');
    expect(newTodoContent).toContain('- [ ] Task 3');
  });

  test('prevents overwriting existing archive', async () => {
    const todoContent = '- [ ] Test task';
    await fs.writeFile(todoPath, todoContent, 'utf-8');

    // Create first archive
    await archiveTodoFile(todoPath, testWorkspace, 'todo-archive');

    // Reset todo file
    await fs.writeFile(todoPath, todoContent, 'utf-8');

    // Try to create second archive on the same day
    await expect(archiveTodoFile(todoPath, testWorkspace, 'todo-archive')).rejects.toThrow();
  });

  test('preserves task formatting and metadata', async () => {
    const todoContent = `- [ ] Order office supplies ✅ 2025-11-14
- [x] Update project dependencies ✅ 2025-12-29
- [ ] Research new framework for [[Web Development]] #important
- [ ] Migrate database to new server`;

    await fs.writeFile(todoPath, todoContent, 'utf-8');

    const result = await archiveTodoFile(todoPath, testWorkspace, 'todo-archive');

    expect(result.incompleteTasks).toHaveLength(3);

    const newTodoContent = await fs.readFile(todoPath, 'utf-8');
    expect(newTodoContent).toContain('- [ ] Order office supplies ✅ 2025-11-14');
    expect(newTodoContent).toContain('- [ ] Research new framework for [[Web Development]] #important');
    expect(newTodoContent).toContain('- [ ] Migrate database to new server');
  });
});
