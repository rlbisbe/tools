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
import { logger, logSuccess, logError, logWarning, logInfo, logBold, colors } from './logger.js';

// Load environment variables
dotenv.config();

const config = {
  cliToolType: process.env.CLI_TOOL_TYPE || 'gemini',
  cliCommand: process.env.CLI_COMMAND || (process.env.GEMINI_CLI_COMMAND || 'gemini'),
  useMockGemini: process.env.USE_MOCK_GEMINI === 'true',
  twitterBearerToken: process.env.TWITTER_BEARER_TOKEN,
  notesPath: process.env.OBSIDIAN_NOTES_PATH || './notes',
  dryRun: process.env.DRY_RUN === 'true'
};

/**
 * Process a single Obsidian note file
 */
async function processNote(filePath, geminiService, twitterService) {
  console.log(`\n${colors.bold('Processing:')} ${colors.magenta(path.basename(filePath))}`);
  const fileStart = Date.now();

  await logger.info('Starting file processing', {
    file: path.basename(filePath),
    fullPath: filePath
  });

  try {
    // Read the note content
    let content = await fs.readFile(filePath, 'utf-8');
    const originalContent = content;

    // Extract URLs from the note
    const urls = extractUrls(content);

    if (urls.length === 0) {
      logWarning('  No URLs found in this note');
      return;
    }

    if (urls.length > 1) {
      logWarning(`  Skipping note with ${urls.length} URLs (only processing single-URL notes)`);
      await logger.info('Skipped multi-URL note', {
        file: path.basename(filePath),
        urlCount: urls.length,
        urls
      });
      return;
    }

    // Check if note already contains processed content
    if (content.includes('**Source:**') || content.includes('---\n\n# ')) {
      logWarning('  Skipping note that already contains processed content');
      await logger.info('Skipped already processed note', {
        file: path.basename(filePath)
      });
      return;
    }

    logInfo(`  Found 1 URL: ${colors.cyan(urls[0])}`);

    let modifiedContent = content;
    let replacementCount = 0;

    // Process the single URL
    const url = urls[0];

    // Check if URL should be ignored
    if (shouldIgnoreUrl(url)) {
      logWarning(`  Skipping (ignored domain): ${url}`);
      return;
    }

    // Skip image files
    if (url.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)$/i)) {
      logWarning(`  Skipping image file: ${url}`);
      return;
    }

    try {
      let markdown;

      // Handle Twitter URLs separately
      if (isTwitterUrl(url)) {
        if (!twitterService) {
          logWarning(`  Skipping Twitter URL (no API token): ${url}`);
          return;
        }

        // Use Twitter service to extract tweet/thread
        const twitterStart = Date.now();
        markdown = await twitterService.urlToMarkdown(url);
        const twitterTime = Date.now() - twitterStart;
        logSuccess(`  Twitter processing complete (${twitterTime}ms)`);

      } else {
        // Regular web article - fetch and convert with Gemini
        const fetchStart = Date.now();
        const html = await fetchUrlContent(url);
        const fetchTime = Date.now() - fetchStart;

        console.log(colors.cyan(`  Converting to Markdown... (fetch: ${fetchTime}ms)`));
        const geminiStart = Date.now();
        markdown = await geminiService.convertHtmlToMarkdown(html, url);
        const geminiTime = Date.now() - geminiStart;
        logSuccess(`  Conversion complete (gemini: ${geminiTime}ms)`);
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
      logSuccess(`  Replaced URL with content`);

    } catch (error) {
      logError(`  Failed to process ${url}: ${error.message}`);
      await logger.error('URL processing failed', {
        file: path.basename(filePath),
        url,
        error: error.message,
        stack: error.stack
      });
      return;
    }

    // Save modified content back to file
    if (replacementCount > 0) {
      if (config.dryRun) {
        logInfo(`  [DRY RUN] Would replace the URL in file`);
        console.log('  Preview (first 500 chars):');
        console.log('  ' + '─'.repeat(50));
        console.log(modifiedContent.substring(0, 500).split('\n').map(line => `  ${line}`).join('\n'));
        if (modifiedContent.length > 500) {
          console.log('  ... (truncated)');
        }
        console.log('  ' + '─'.repeat(50));
      } else {
        await fs.writeFile(filePath, modifiedContent, 'utf-8');
        logSuccess(`  Updated file with expanded URL`);
      }
    }

    const fileTime = Date.now() - fileStart;
    console.log(colors.dim(`  File processing complete (${fileTime}ms total)`));

    await logger.info('File processing complete', {
      file: path.basename(filePath),
      totalTime: fileTime,
      success: replacementCount > 0
    });

  } catch (error) {
    logError(`  Error processing file: ${error.message}`);
    await logger.error('File processing error', {
      file: path.basename(filePath),
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Main function
 */
async function main() {
  logBold('Obsidian to Article Converter\n');

  // Validate configuration
  if (!config.useMockGemini && !config.cliCommand) {
    logError('Error: CLI_COMMAND is required when USE_MOCK_GEMINI is not true');
    logError('Please set up your .env file (see .env.example) or ensure the CLI tool is in your PATH');
    process.exit(1);
  }

  // Create Gemini service
  const geminiService = createGeminiService(config.useMockGemini, config.cliCommand, config.cliToolType);

  // Create Twitter service (optional)
  const twitterService = createTwitterService(config.twitterBearerToken);

  logInfo(`Notes path: ${config.notesPath}`);
  logInfo(`CLI Tool: ${config.useMockGemini ? 'MOCK' : `${config.cliToolType.toUpperCase()} (${config.cliCommand})`}`);
  logInfo(`Twitter API: ${twitterService ? 'ENABLED' : 'DISABLED (no bearer token)'}`);
  logInfo(`Dry run: ${config.dryRun ? 'ENABLED (no files will be modified)' : 'DISABLED'}\n`);

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

  logSuccess('\nDone!');
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
