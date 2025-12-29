#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { createGeminiService } from './geminiService.js';
import { createTwitterService } from './twitterService.js';
import {
  extractUrls,
  shouldIgnoreUrl,
  isTwitterUrl,
  fetchUrlContent
} from './utils.js';

// Load environment variables
dotenv.config();

const config = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  useMockGemini: process.env.USE_MOCK_GEMINI === 'true',
  twitterBearerToken: process.env.TWITTER_BEARER_TOKEN,
  notesPath: process.env.OBSIDIAN_NOTES_PATH || './notes',
  dryRun: process.env.DRY_RUN === 'true'
};

/**
 * Process a single Obsidian note file
 */
async function processNote(filePath, geminiService, twitterService) {
  console.log(`\nProcessing: ${path.basename(filePath)}`);
  const fileStart = Date.now();

  try {
    // Read the note content
    let content = await fs.readFile(filePath, 'utf-8');
    const originalContent = content;

    // Extract URLs from the note
    const urls = extractUrls(content);

    if (urls.length === 0) {
      console.log('  No URLs found in this note');
      return;
    }

    if (urls.length > 1) {
      console.log(`  Skipping note with ${urls.length} URLs (only processing single-URL notes)`);
      return;
    }

    console.log(`  Found 1 URL: ${urls[0]}`);

    let modifiedContent = content;
    let replacementCount = 0;

    // Process the single URL
    const url = urls[0];

    // Check if URL should be ignored
    if (shouldIgnoreUrl(url)) {
      console.log(`  Skipping (ignored domain): ${url}`);
      return;
    }

    // Skip image files
    if (url.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)$/i)) {
      console.log(`  Skipping image file: ${url}`);
      return;
    }

    try {
      let markdown;

      // Handle Twitter URLs separately
      if (isTwitterUrl(url)) {
        if (!twitterService) {
          console.log(`  Skipping Twitter URL (no API token): ${url}`);
          return;
        }

        // Use Twitter service to extract tweet/thread
        const twitterStart = Date.now();
        markdown = await twitterService.urlToMarkdown(url);
        const twitterTime = Date.now() - twitterStart;
        console.log(`  Twitter processing complete (${twitterTime}ms)`);

      } else {
        // Regular web article - fetch and convert with Gemini
        const fetchStart = Date.now();
        const html = await fetchUrlContent(url);
        const fetchTime = Date.now() - fetchStart;

        console.log(`  Converting to Markdown... (fetch: ${fetchTime}ms)`);
        const geminiStart = Date.now();
        markdown = await geminiService.convertHtmlToMarkdown(html, url);
        const geminiTime = Date.now() - geminiStart;
        console.log(`  Conversion complete (gemini: ${geminiTime}ms)`);
      }

      // Replace URL with markdown content in-place
      const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Replace markdown-style links first
      const markdownLinkRegex = new RegExp(`\\[([^\\]]+)\\]\\(${escapedUrl}\\)`, 'g');
      const markdownReplaced = modifiedContent.replace(markdownLinkRegex, (match, linkText) => {
        return `\n\n---\n\n# ${linkText}\n\n${markdown}\n\n**Source:** ${url}\n\n---\n\n`;
      });

      // If no markdown link was found, replace plain URL
      if (markdownReplaced === modifiedContent) {
        modifiedContent = modifiedContent.replace(new RegExp(escapedUrl, 'g'), 
          `\n\n---\n\n# Article Content\n\n${markdown}\n\n**Source:** ${url}\n\n---\n\n`);
      } else {
        modifiedContent = markdownReplaced;
      }

      replacementCount = 1;
      console.log(`  Replaced URL with content`);

    } catch (error) {
      console.error(`  Failed to process ${url}:`, error.message);
      return;
    }

    // Save modified content back to file
    if (replacementCount > 0) {
      if (config.dryRun) {
        console.log(`  [DRY RUN] Would replace the URL in file`);
        console.log('  Preview (first 500 chars):');
        console.log('  ' + '─'.repeat(50));
        console.log(modifiedContent.substring(0, 500).split('\n').map(line => `  ${line}`).join('\n'));
        if (modifiedContent.length > 500) {
          console.log('  ... (truncated)');
        }
        console.log('  ' + '─'.repeat(50));
      } else {
        await fs.writeFile(filePath, modifiedContent, 'utf-8');
        console.log(`  Updated file with expanded URL`);
      }
    }

    const fileTime = Date.now() - fileStart;
    console.log(`  File processing complete (${fileTime}ms total)`);

  } catch (error) {
    console.error(`  Error processing file:`, error.message);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('Obsidian to Article Converter\n');

  // Validate configuration
  if (!config.useMockGemini && !config.geminiApiKey) {
    console.error('Error: GEMINI_API_KEY is required when USE_MOCK_GEMINI is not true');
    console.error('Please set up your .env file (see .env.example)');
    process.exit(1);
  }

  // Create Gemini service
  const geminiService = createGeminiService(config.useMockGemini, config.geminiApiKey);

  // Create Twitter service (optional)
  const twitterService = createTwitterService(config.twitterBearerToken);

  console.log(`Notes path: ${config.notesPath}`);
  console.log(`Using ${config.useMockGemini ? 'MOCK' : 'REAL'} Gemini service`);
  console.log(`Twitter API: ${twitterService ? 'ENABLED' : 'DISABLED (no bearer token)'}`);
  console.log(`Dry run: ${config.dryRun ? 'ENABLED (no files will be modified)' : 'DISABLED'}\n`);

  // Check if notes directory exists
  try {
    await fs.access(config.notesPath);
  } catch (error) {
    console.error(`Error: Notes directory not found: ${config.notesPath}`);
    console.error('Please create the directory and add your Obsidian notes');
    process.exit(1);
  }

  // Read all markdown files from notes directory (base folder only)
  const files = await fs.readdir(config.notesPath);
  const markdownFiles = files.filter(file => 
    file.endsWith('.md') && 
    !file.includes('/') && 
    !file.startsWith('.')
  );

  if (markdownFiles.length === 0) {
    console.log('No markdown files found in notes directory');
    return;
  }

  console.log(`Found ${markdownFiles.length} markdown file(s)\n`);
  console.log('='.repeat(50));

  // Process each note
  for (const file of markdownFiles) {
    const filePath = path.join(config.notesPath, file);
    await processNote(filePath, geminiService, twitterService);
  }

  console.log('\n' + '='.repeat(50));
  console.log('Done!');
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
