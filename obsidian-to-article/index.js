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
  fetchUrlContent,
  createFilenameFromUrl
} from './utils.js';

// Load environment variables
dotenv.config();

const config = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  useMockGemini: process.env.USE_MOCK_GEMINI === 'true',
  twitterBearerToken: process.env.TWITTER_BEARER_TOKEN,
  notesPath: process.env.OBSIDIAN_NOTES_PATH || './notes',
  outputPath: process.env.OUTPUT_PATH || './output',
  dryRun: process.env.DRY_RUN === 'true',
  deleteLinks: process.env.DELETE_LINKS !== 'false' // Default to true
};

/**
 * Process a single Obsidian note file
 */
async function processNote(filePath, geminiService, twitterService) {
  console.log(`\n📄 Processing: ${path.basename(filePath)}`);

  try {
    // Read the note content
    let content = await fs.readFile(filePath, 'utf-8');
    const originalContent = content;

    // Extract URLs from the note
    const urls = extractUrls(content);

    if (urls.length === 0) {
      console.log('  ⚠️  No URLs found in this note');
      return;
    }

    console.log(`  Found ${urls.length} URL(s)`);

    const processedUrls = [];

    // Process each URL
    for (const url of urls) {
      // Check if URL should be ignored
      if (shouldIgnoreUrl(url)) {
        console.log(`  ⏭️  Skipping (ignored domain): ${url}`);
        continue;
      }

      try {
        let markdown;
        let filename;

        // Handle Twitter URLs separately
        if (isTwitterUrl(url)) {
          if (!twitterService) {
            console.log(`  ⚠️  Skipping Twitter URL (no API token): ${url}`);
            continue;
          }

          // Use Twitter service to extract tweet/thread
          markdown = await twitterService.urlToMarkdown(url);
          filename = `twitter-${twitterService.extractTweetId(url)}`;

        } else {
          // Regular web article - fetch and convert with Gemini
          const html = await fetchUrlContent(url);

          console.log('  🔄 Converting to Markdown...');
          markdown = await geminiService.convertHtmlToMarkdown(html, url);
          filename = createFilenameFromUrl(url);
        }

        const outputFile = path.join(config.outputPath, `${filename}.md`);

        // Handle dry-run mode
        if (config.dryRun) {
          console.log(`  🔍 [DRY RUN] Would save to: ${outputFile}`);
          console.log('  📋 Preview (first 500 chars):');
          console.log('  ' + '─'.repeat(50));
          console.log(markdown.substring(0, 500).split('\n').map(line => `  ${line}`).join('\n'));
          if (markdown.length > 500) {
            console.log('  ... (truncated)');
          }
          console.log('  ' + '─'.repeat(50));
        } else {
          // Save the result
          await fs.mkdir(config.outputPath, { recursive: true });
          await fs.writeFile(outputFile, markdown, 'utf-8');
          console.log(`  ✅ Saved: ${outputFile}`);
        }

        // Track successfully processed URLs
        processedUrls.push(url);

      } catch (error) {
        console.error(`  ❌ Failed to process ${url}:`, error.message);
      }
    }

    // Delete links from source file if enabled
    if (config.deleteLinks && processedUrls.length > 0 && !config.dryRun) {
      let modifiedContent = originalContent;

      for (const url of processedUrls) {
        // Remove markdown-style links containing this URL
        const markdownLinkRegex = new RegExp(`\\[([^\\]]+)\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g');
        modifiedContent = modifiedContent.replace(markdownLinkRegex, '');

        // Remove plain URLs
        modifiedContent = modifiedContent.replace(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
      }

      // Clean up extra blank lines (more than 2 consecutive)
      modifiedContent = modifiedContent.replace(/\n{3,}/g, '\n\n');

      if (modifiedContent !== originalContent) {
        await fs.writeFile(filePath, modifiedContent, 'utf-8');
        console.log(`  🗑️  Removed ${processedUrls.length} processed link(s) from source file`);
      }
    } else if (config.deleteLinks && processedUrls.length > 0 && config.dryRun) {
      console.log(`  🔍 [DRY RUN] Would remove ${processedUrls.length} processed link(s) from source file`);
    }

  } catch (error) {
    console.error(`  ❌ Error processing file:`, error.message);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Obsidian to Article Converter\n');

  // Validate configuration
  if (!config.useMockGemini && !config.geminiApiKey) {
    console.error('❌ Error: GEMINI_API_KEY is required when USE_MOCK_GEMINI is not true');
    console.error('Please set up your .env file (see .env.example)');
    process.exit(1);
  }

  // Create Gemini service
  const geminiService = createGeminiService(config.useMockGemini, config.geminiApiKey);

  // Create Twitter service (optional)
  const twitterService = createTwitterService(config.twitterBearerToken);

  console.log(`📁 Notes path: ${config.notesPath}`);
  console.log(`📁 Output path: ${config.outputPath}`);
  console.log(`🤖 Using ${config.useMockGemini ? 'MOCK' : 'REAL'} Gemini service`);
  console.log(`🐦 Twitter API: ${twitterService ? 'ENABLED' : 'DISABLED (no bearer token)'}`);
  console.log(`🔍 Dry run: ${config.dryRun ? 'ENABLED (no files will be modified)' : 'DISABLED'}`);
  console.log(`🗑️  Delete links: ${config.deleteLinks ? 'ENABLED' : 'DISABLED'}\n`);

  // Check if notes directory exists
  try {
    await fs.access(config.notesPath);
  } catch (error) {
    console.error(`❌ Error: Notes directory not found: ${config.notesPath}`);
    console.error('Please create the directory and add your Obsidian notes');
    process.exit(1);
  }

  // Read all markdown files from notes directory
  const files = await fs.readdir(config.notesPath);
  const markdownFiles = files.filter(file => file.endsWith('.md'));

  if (markdownFiles.length === 0) {
    console.log('⚠️  No markdown files found in notes directory');
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
  console.log('✨ Done!');
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
