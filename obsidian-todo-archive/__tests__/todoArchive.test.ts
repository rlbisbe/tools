import fs from 'fs/promises';
import path from 'path';
import {
  getTodayDate,
  isTodoLine,
  isCompletedTodo,
  parseLine,
  extractIncompleteTasks,
  countCompletedTasks,
  countTotalTasks,
  archiveTodoFile,
} from '../src/index.js';

describe('Todo Archive', () => {
  describe('getTodayDate', () => {
    test('returns date in YYYY-MM-DD format', () => {
      const date = getTodayDate();
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('includes current year', () => {
      const date = getTodayDate();
      const currentYear = new Date().getFullYear();
      expect(date.startsWith(String(currentYear))).toBe(true);
    });
  });

  describe('isTodoLine', () => {
    test('identifies unchecked todo items', () => {
      expect(isTodoLine('- [ ] Todo item')).toBe(true);
      expect(isTodoLine('  - [ ] Indented todo')).toBe(true);
    });

    test('identifies checked todo items', () => {
      expect(isTodoLine('- [x] Done item')).toBe(true);
      expect(isTodoLine('- [X] Done item uppercase')).toBe(true);
    });

    test('rejects non-todo lines', () => {
      expect(isTodoLine('Regular text')).toBe(false);
      expect(isTodoLine('- Regular list item')).toBe(false);
      expect(isTodoLine('# Header')).toBe(false);
      expect(isTodoLine('2025-10-11')).toBe(false);
    });
  });

  describe('isCompletedTodo', () => {
    test('identifies completed todos', () => {
      expect(isCompletedTodo('- [x] Done task')).toBe(true);
      expect(isCompletedTodo('- [X] Done task uppercase')).toBe(true);
      expect(isCompletedTodo('  - [x] Indented done task')).toBe(true);
    });

    test('rejects incomplete todos', () => {
      expect(isCompletedTodo('- [ ] Incomplete task')).toBe(false);
    });

    test('rejects non-todo lines', () => {
      expect(isCompletedTodo('Regular text')).toBe(false);
      expect(isCompletedTodo('- Regular list')).toBe(false);
    });
  });

  describe('parseLine', () => {
    test('parses incomplete todo', () => {
      const line = '- [ ] Buy groceries';
      const result = parseLine(line);

      expect(result.line).toBe(line);
      expect(result.isTodo).toBe(true);
      expect(result.isCompleted).toBe(false);
    });

    test('parses completed todo', () => {
      const line = '- [x] Task done ✅ 2025-10-24';
      const result = parseLine(line);

      expect(result.line).toBe(line);
      expect(result.isTodo).toBe(true);
      expect(result.isCompleted).toBe(true);
    });

    test('parses non-todo line', () => {
      const line = '# Header';
      const result = parseLine(line);

      expect(result.line).toBe(line);
      expect(result.isTodo).toBe(false);
      expect(result.isCompleted).toBe(false);
    });

    test('parses todo with tags and links', () => {
      const line = '- [ ] Write on [[Article]] #proyectos/articulos';
      const result = parseLine(line);

      expect(result.line).toBe(line);
      expect(result.isTodo).toBe(true);
      expect(result.isCompleted).toBe(false);
    });
  });

  describe('extractIncompleteTasks', () => {
    test('extracts only incomplete tasks', () => {
      const content = `2025-10-11
- [ ] Task 1
- [x] Task 2 ✅ 2025-10-24
- [ ] Task 3 #tag
- [x] Task 4`;

      const incompleteTasks = extractIncompleteTasks(content);

      expect(incompleteTasks).toHaveLength(2);
      expect(incompleteTasks[0]).toBe('- [ ] Task 1');
      expect(incompleteTasks[1]).toBe('- [ ] Task 3 #tag');
    });

    test('handles content with no incomplete tasks', () => {
      const content = `2025-10-11
- [x] Task 1
- [x] Task 2`;

      const incompleteTasks = extractIncompleteTasks(content);

      expect(incompleteTasks).toHaveLength(0);
    });

    test('handles content with only incomplete tasks', () => {
      const content = `- [ ] Task 1
- [ ] Task 2
- [ ] Task 3`;

      const incompleteTasks = extractIncompleteTasks(content);

      expect(incompleteTasks).toHaveLength(3);
    });

    test('preserves task formatting', () => {
      const content = '- [ ] [[Link]] and #tag ✅ 2025-10-24';
      const incompleteTasks = extractIncompleteTasks(content);

      expect(incompleteTasks[0]).toBe('- [ ] [[Link]] and #tag ✅ 2025-10-24');
    });
  });

  describe('countCompletedTasks', () => {
    test('counts completed tasks correctly', () => {
      const content = `- [ ] Task 1
- [x] Task 2
- [x] Task 3
- [ ] Task 4`;

      const count = countCompletedTasks(content);
      expect(count).toBe(2);
    });

    test('returns 0 when no completed tasks', () => {
      const content = `- [ ] Task 1
- [ ] Task 2`;

      const count = countCompletedTasks(content);
      expect(count).toBe(0);
    });

    test('counts all completed tasks', () => {
      const content = `- [x] Task 1
- [x] Task 2
- [x] Task 3`;

      const count = countCompletedTasks(content);
      expect(count).toBe(3);
    });
  });

  describe('countTotalTasks', () => {
    test('counts all tasks correctly', () => {
      const content = `2025-10-11
- [ ] Task 1
- [x] Task 2
Regular text
- [ ] Task 3`;

      const count = countTotalTasks(content);
      expect(count).toBe(3);
    });

    test('returns 0 when no tasks', () => {
      const content = `# Header
Regular text
More text`;

      const count = countTotalTasks(content);
      expect(count).toBe(0);
    });

    test('handles mixed content', () => {
      const content = `# Todo List

2025-10-11
- [ ] Task 1
- [x] Task 2 ✅ 2025-10-24

## Notes
Some notes here

- [ ] Task 3 #tag`;

      const count = countTotalTasks(content);
      expect(count).toBe(3);
    });
  });
});
