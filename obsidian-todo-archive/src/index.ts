#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import type { Config, TodoItem, ArchiveResult } from './types.js';

dotenv.config();

const config: Config = {
  notesPath: process.env.OBSIDIAN_NOTES_PATH || './notes',
  todoFile: process.env.TODO_FILE || 'todo.md',
  archivePrefix: process.env.ARCHIVE_PREFIX || 'todo-archive',
};

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a line is a todo item
 */
export function isTodoLine(line: string): boolean {
  return /^\s*-\s*\[[ x]\]/i.test(line);
}

/**
 * Check if a todo item is completed
 */
export function isCompletedTodo(line: string): boolean {
  return /^\s*-\s*\[x\]/i.test(line);
}

/**
 * Parse a line into a TodoItem
 */
export function parseLine(line: string): TodoItem {
  const isTodo = isTodoLine(line);
  const isCompleted = isTodo && isCompletedTodo(line);

  return {
    line,
    isCompleted,
    isTodo,
  };
}

/**
 * Extract incomplete tasks from content
 */
export function extractIncompleteTasks(content: string): string[] {
  const lines = content.split('\n');
  const incompleteTasks: string[] = [];

  for (const line of lines) {
    const item = parseLine(line);
    if (item.isTodo && !item.isCompleted) {
      incompleteTasks.push(line);
    }
  }

  return incompleteTasks;
}

/**
 * Count completed tasks in content
 */
export function countCompletedTasks(content: string): number {
  const lines = content.split('\n');
  let count = 0;

  for (const line of lines) {
    const item = parseLine(line);
    if (item.isTodo && item.isCompleted) {
      count++;
    }
  }

  return count;
}

/**
 * Count total tasks in content
 */
export function countTotalTasks(content: string): number {
  const lines = content.split('\n');
  let count = 0;

  for (const line of lines) {
    const item = parseLine(line);
    if (item.isTodo) {
      count++;
    }
  }

  return count;
}

/**
 * Archive the todo file
 */
export async function archiveTodoFile(
  todoPath: string,
  notesPath: string,
  archivePrefix: string
): Promise<ArchiveResult> {
  console.log(`\n📦 Archiving todo list: ${path.basename(todoPath)}\n`);

  // Read the current todo file
  const content = await fs.readFile(todoPath, 'utf-8');

  // Get today's date for the archive filename
  const today = getTodayDate();
  const archiveFilename = `${archivePrefix}-${today}.md`;
  const archivePath = path.join(notesPath, archiveFilename);

  // Check if archive already exists
  try {
    await fs.access(archivePath);
    const errorMessage = `Archive file already exists: ${archiveFilename}. Archive operation cancelled to prevent overwriting.`;
    console.log(`⚠️  ${errorMessage}`);
    throw new Error(errorMessage);
  } catch (error) {
    // If error is from access check, file doesn't exist - continue
    // If error is from our throw, re-throw it
    if (error instanceof Error && error.message.includes('Archive file already exists')) {
      throw error;
    }
    // File doesn't exist, continue
  }

  // Write the archive file
  await fs.writeFile(archivePath, content, 'utf-8');
  console.log(`✅ Created archive: ${archiveFilename}`);

  // Extract incomplete tasks
  const incompleteTasks = extractIncompleteTasks(content);
  const totalTasks = countTotalTasks(content);
  const completedTasks = countCompletedTasks(content);

  // Create new todo file content
  let newContent = `# Archive\n\n`;
  newContent += `Previous todo list archived to: [[${archiveFilename.replace('.md', '')}]]\n\n`;

  if (incompleteTasks.length > 0) {
    newContent += `# Previously on tasks\n\n`;
    newContent += incompleteTasks.join('\n');
    newContent += '\n';
  }

  // Write the new todo file
  await fs.writeFile(todoPath, newContent, 'utf-8');
  console.log(`✅ Updated todo file with ${incompleteTasks.length} incomplete task(s)`);

  return {
    archiveFilename,
    incompleteTasks,
    totalTasks,
    completedTasks,
  };
}

/**
 * Main function
 */
export async function main(): Promise<void> {
  console.log('📚 Obsidian Todo Archiver\n');
  console.log('Archives todo lists with timestamps and preserves incomplete tasks\n');

  const todoPath = path.join(config.notesPath, config.todoFile);

  console.log(`📁 Notes path: ${config.notesPath}`);
  console.log(`📄 Todo file: ${config.todoFile}`);
  console.log(`📦 Archive prefix: ${config.archivePrefix}`);

  // Check if todo file exists
  try {
    await fs.access(todoPath);
  } catch (error) {
    console.error(`\n❌ Error: Todo file not found: ${todoPath}`);
    console.error('Please create the file or set TODO_FILE in your .env');
    process.exit(1);
  }

  // Ensure notes directory exists
  await fs.mkdir(config.notesPath, { recursive: true });

  // Archive the todo list
  try {
    const result = await archiveTodoFile(todoPath, config.notesPath, config.archivePrefix);

    console.log(`\n📊 Summary:`);
    console.log(`  • Total tasks: ${result.totalTasks}`);
    console.log(`  • Completed tasks: ${result.completedTasks}`);
    console.log(`  • Incomplete tasks: ${result.incompleteTasks.length}`);
    console.log(`  • Archive file: ${result.archiveFilename}`);

    console.log('\n✨ Done!');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Error archiving todo list:', errorMessage);
    process.exit(1);
  }
}

// Run the script only when executed directly (not when imported)
const isMainModule = process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts');
if (isMainModule) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}
