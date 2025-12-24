#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import type {
  Config,
  ExtractedUrl,
  NoteCreationResult,
  ProcessedUrl,
  ProcessingSummary
} from './types.js';

dotenv.config();

const config: Config = {
  notesPath: process.env.OBSIDIAN_NOTES_PATH || './notes',
  todoFile: process.env.TODO_FILE || 'todo.md',
};

/**
 * Extract URLs from a line of text
 * Supports both plain URLs and markdown-style links
 */
export function extractUrlsFromLine(line: string): ExtractedUrl[] {
  const urls: ExtractedUrl[] = [];

  // Match markdown-style links [text](url)
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = markdownLinkRegex.exec(line)) !== null) {
    const url = match[2];
    const fullMatch = match[0];
    if (url && fullMatch) {
      urls.push({ url, type: 'markdown', fullMatch });
    }
  }

  // Match plain URLs (excluding already matched markdown links)
  let tempLine = line;
  urls.forEach(({ fullMatch }) => {
    tempLine = tempLine.replace(fullMatch, '');
  });

  const urlRegex = /https?:\/\/[^\s<>\[\]()]+/g;
  const plainMatches = tempLine.matchAll(urlRegex);
  for (const match of plainMatches) {
    urls.push({ url: match[0], type: 'plain', fullMatch: match[0] });
  }

  return urls;
}

/**
 * Check if a line is a todo item
 */
export function isTodoLine(line: string): boolean {
  return /^\s*-\s*\[[ x]\]/i.test(line);
}

/**
 * Create a filename from URL
 */
export function createFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/^www\./, '');
    const pathname = urlObj.pathname.replace(/\/$/, '');
    const lastPart = pathname.split('/').filter(Boolean).pop() || hostname;

    const filename = `${hostname}-${lastPart}`
      .replace(/[^a-z0-9]/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .substring(0, 80);

    return filename;
  } catch (error) {
    return url
      .replace(/[^a-z0-9]/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .substring(0, 80);
  }
}

/**
 * Create a new note with the URL as content
 */
export async function createNoteForUrl(url: string, notesPath: string): Promise<NoteCreationResult> {
  const filename = createFilenameFromUrl(url);
  const filepath = path.join(notesPath, `${filename}.md`);

  // Check if file already exists
  try {
    await fs.access(filepath);
    console.log(`  ⚠️  Note already exists: ${filename}.md`);
    return { filename, existed: true };
  } catch {
    // File doesn't exist, create it
  }

  // Create note content with just the URL
  const content = `${url}\n`;

  await fs.writeFile(filepath, content, 'utf-8');
  console.log(`  ✅ Created note: ${filename}.md`);

  return { filename, existed: false };
}

/**
 * Process the todo list file
 */
export async function processTodoList(filePath: string, notesPath: string): Promise<ProcessingSummary> {
  console.log(`\n📋 Processing todo list: ${path.basename(filePath)}\n`);

  // Read the todo file
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  const linesToKeep: string[] = [];
  const processedUrls: ProcessedUrl[] = [];
  let urlCount = 0;

  // Process each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      linesToKeep.push('');
      continue;
    }

    const lineNum = i + 1;

    // Check if this is a todo item with a URL
    if (isTodoLine(line)) {
      const urls = extractUrlsFromLine(line);

      if (urls.length > 0) {
        console.log(`📍 Line ${lineNum}: Found ${urls.length} URL(s)`);

        // Process each URL found in this line
        for (const { url } of urls) {
          try {
            const result = await createNoteForUrl(url, notesPath);
            processedUrls.push({ url, ...result });
            urlCount++;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`  ❌ Failed to create note for ${url}:`, errorMessage);
            // Keep the line if we couldn't process the URL
            linesToKeep.push(line);
            continue;
          }
        }

        // Don't keep this line since we processed its URL(s)
        continue;
      }
    }

    // Keep all other lines
    linesToKeep.push(line);
  }

  // Write the modified content back
  const newContent = linesToKeep.join('\n');
  await fs.writeFile(filePath, newContent, 'utf-8');

  console.log(`\n📊 Summary:`);
  console.log(`  • Processed ${urlCount} URL(s)`);
  console.log(`  • Created ${processedUrls.filter(p => !p.existed).length} new note(s)`);
  console.log(`  • Skipped ${processedUrls.filter(p => p.existed).length} existing note(s)`);
  console.log(`  • Removed ${urlCount} todo item(s) from list`);

  return {
    totalUrls: urlCount,
    created: processedUrls.filter(p => !p.existed).length,
    skipped: processedUrls.filter(p => p.existed).length
  };
}

/**
 * Main function
 */
export async function main(): Promise<void> {
  console.log('🔗 Obsidian URL Extractor\n');
  console.log('Extracts URLs from todo lists and creates individual notes\n');

  const todoPath = path.join(config.notesPath, config.todoFile);

  console.log(`📁 Notes path: ${config.notesPath}`);
  console.log(`📄 Todo file: ${config.todoFile}`);

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

  // Process the todo list
  try {
    await processTodoList(todoPath, config.notesPath);
    console.log('\n✨ Done!');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Error processing todo list:', errorMessage);
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
