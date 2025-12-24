/**
 * Type definitions for the Obsidian URL Extractor
 */

/**
 * Configuration for the URL extractor
 */
export interface Config {
  notesPath: string;
  todoFile: string;
}

/**
 * Type of URL match found in the text
 */
export type UrlType = 'markdown' | 'plain';

/**
 * Extracted URL information
 */
export interface ExtractedUrl {
  url: string;
  type: UrlType;
  fullMatch: string;
}

/**
 * Result of creating a note for a URL
 */
export interface NoteCreationResult {
  filename: string;
  existed: boolean;
}

/**
 * Information about a processed URL
 */
export interface ProcessedUrl extends NoteCreationResult {
  url: string;
}

/**
 * Summary of the processing results
 */
export interface ProcessingSummary {
  totalUrls: number;
  created: number;
  skipped: number;
}
