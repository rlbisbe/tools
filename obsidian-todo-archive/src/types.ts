/**
 * Type definitions for the Obsidian Todo Archive
 */

/**
 * Configuration for the todo archiver
 */
export interface Config {
  notesPath: string;
  todoFile: string;
  archivePrefix: string;
}

/**
 * Represents a todo item
 */
export interface TodoItem {
  line: string;
  isCompleted: boolean;
  isTodo: boolean;
}

/**
 * Result of archiving the todo file
 */
export interface ArchiveResult {
  archiveFilename: string;
  incompleteTasks: string[];
  totalTasks: number;
  completedTasks: number;
}
