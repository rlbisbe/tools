#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import inquirer from 'inquirer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate .env file content from config
 */
export function generateEnvContent(config) {
  return `# AI CLI Tool Configuration
# Choose which AI CLI tool to use: 'gemini', 'kiro', or 'claude'
CLI_TOOL_TYPE=${config.CLI_TOOL_TYPE}

# Command to invoke the CLI tool
CLI_COMMAND=${config.CLI_COMMAND}

# Set to 'true' to use mock service (for testing without CLI tool)
USE_MOCK_GEMINI=${config.USE_MOCK_GEMINI}

# Twitter API Configuration (optional - for Twitter/X URL support)
# Get your Bearer Token from https://developer.twitter.com/en/portal/dashboard
TWITTER_BEARER_TOKEN=${config.TWITTER_BEARER_TOKEN}

# Input/Output Configuration
OBSIDIAN_NOTES_PATH=${config.OBSIDIAN_NOTES_PATH}
OUTPUT_PATH=${config.OUTPUT_PATH}

# Processing Options
# Set to 'true' to preview results without saving files or modifying source
DRY_RUN=${config.DRY_RUN}

# Set to 'false' to keep processed links in source files (default: true)
DELETE_LINKS=${config.DELETE_LINKS}
`;
}

/**
 * Get setup questions
 */
export function getSetupQuestions() {
  return [
    {
      type: 'confirm',
      name: 'useMockGemini',
      message: 'Do you want to use MOCK service (no CLI tool needed)?',
      default: true
    },
    {
      type: 'list',
      name: 'cliToolType',
      message: '🤖 Select which AI CLI tool you want to use:',
      choices: [
        { name: 'Gemini', value: 'gemini' },
        { name: 'Kiro', value: 'kiro' },
        { name: 'Claude Code', value: 'claude' }
      ],
      default: 'gemini',
      when: (answers) => !answers.useMockGemini
    },
    {
      type: 'input',
      name: 'cliCommand',
      message: (answers) => {
        const toolName = answers.cliToolType || 'gemini';
        return `💡 Enter the ${toolName} CLI command (e.g., "${toolName}" or "/path/to/${toolName}"):`;
      },
      default: (answers) => answers.cliToolType || 'gemini',
      when: (answers) => !answers.useMockGemini,
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'CLI command is required when not using mock mode. Press Ctrl+C to cancel or enter a command.';
        }
        return true;
      }
    },
    {
      type: 'confirm',
      name: 'useTwitter',
      message: 'Do you want to enable Twitter/X URL support?',
      default: false
    },
    {
      type: 'input',
      name: 'twitterBearerToken',
      message: '💡 Enter your Twitter Bearer Token (get one at https://developer.twitter.com/en/portal/dashboard):',
      when: (answers) => answers.useTwitter
    },
    {
      type: 'input',
      name: 'notesPath',
      message: 'Enter the path to your Obsidian notes directory:',
      default: './notes'
    },
    {
      type: 'input',
      name: 'outputPath',
      message: 'Enter the path for output articles:',
      default: './output'
    },
    {
      type: 'confirm',
      name: 'dryRun',
      message: 'Enable DRY RUN mode (preview without writing files)?',
      default: false
    },
    {
      type: 'confirm',
      name: 'deleteLinks',
      message: 'Enable AUTO-CLEANUP (remove processed links from source files)?',
      default: true
    }
  ];
}

/**
 * Transform user answers to config object
 */
export function answersToConfig(answers) {
  return {
    USE_MOCK_GEMINI: answers.useMockGemini ? 'true' : 'false',
    CLI_TOOL_TYPE: answers.useMockGemini ? 'gemini' : (answers.cliToolType || 'gemini'),
    CLI_COMMAND: answers.useMockGemini
      ? 'gemini'
      : (answers.cliCommand || answers.cliToolType || 'gemini'),
    TWITTER_BEARER_TOKEN: answers.twitterBearerToken || 'your_twitter_bearer_token_here',
    OBSIDIAN_NOTES_PATH: answers.notesPath,
    OUTPUT_PATH: answers.outputPath,
    DRY_RUN: answers.dryRun ? 'true' : 'false',
    DELETE_LINKS: answers.deleteLinks ? 'true' : 'false'
  };
}

/**
 * Main setup function
 */
export async function runSetup() {
  console.log('🚀 Obsidian to Article Converter - Setup Wizard\n');
  console.log('This wizard will help you configure your environment variables.\n');

  // Get user answers
  const answers = await inquirer.prompt(getSetupQuestions());

  // Transform to config
  const config = answersToConfig(answers);

  // Generate .env content
  const envContent = generateEnvContent(config);
  const envPath = path.join(__dirname, '.env');

  // Check if .env already exists
  let shouldWrite = true;
  try {
    await fs.access(envPath);
    console.log('\n⚠️  .env file already exists!');

    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Do you want to overwrite it?',
        default: false
      }
    ]);

    if (overwrite) {
      // Create backup
      const backupPath = path.join(__dirname, '.env.backup');
      await fs.copyFile(envPath, backupPath);
      console.log('✅ Current .env backed up to .env.backup');
      shouldWrite = true;
    } else {
      shouldWrite = false;
    }
  } catch (error) {
    // .env doesn't exist, safe to create
  }

  if (shouldWrite) {
    await fs.writeFile(envPath, envContent, 'utf-8');
    console.log('\n✅ .env file created successfully!');
  } else {
    console.log('\n❌ Setup cancelled. .env file was not modified.');
    return config;
  }

  // Create directories
  console.log('\n📂 Creating directories...');

  try {
    const notesPath = path.resolve(__dirname, config.OBSIDIAN_NOTES_PATH);
    await fs.mkdir(notesPath, { recursive: true });
    console.log(`✅ Notes directory created: ${config.OBSIDIAN_NOTES_PATH}`);
  } catch (error) {
    console.log(`ℹ️  Notes directory already exists: ${config.OBSIDIAN_NOTES_PATH}`);
  }

  try {
    const outputPath = path.resolve(__dirname, config.OUTPUT_PATH);
    await fs.mkdir(outputPath, { recursive: true });
    console.log(`✅ Output directory created: ${config.OUTPUT_PATH}`);
  } catch (error) {
    console.log(`ℹ️  Output directory already exists: ${config.OUTPUT_PATH}`);
  }

  // Summary
  console.log('\n' + '━'.repeat(60));
  console.log('🎉 SETUP COMPLETE!');
  console.log('━'.repeat(60));
  console.log('\n📋 Your configuration:');
  console.log(`  • AI Tool: ${config.USE_MOCK_GEMINI === 'true' ? 'MOCK mode' : `${config.CLI_TOOL_TYPE.toUpperCase()} (${config.CLI_COMMAND})`}`);
  console.log(`  • Twitter: ${config.TWITTER_BEARER_TOKEN !== 'your_twitter_bearer_token_here' ? 'ENABLED' : 'DISABLED'}`);
  console.log(`  • Notes path: ${config.OBSIDIAN_NOTES_PATH}`);
  console.log(`  • Output path: ${config.OUTPUT_PATH}`);
  console.log(`  • Dry run: ${config.DRY_RUN === 'true' ? 'ENABLED' : 'DISABLED'}`);
  console.log(`  • Auto-cleanup: ${config.DELETE_LINKS === 'true' ? 'ENABLED' : 'DISABLED'}`);

  console.log('\n📝 Next steps:');
  console.log('  1. Add your Obsidian notes to:', config.OBSIDIAN_NOTES_PATH);
  console.log('  2. Run the converter: npm start');
  console.log('  3. Check the output in:', config.OUTPUT_PATH);

  console.log('\n✨ Happy converting!\n');

  return config;
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSetup().catch(error => {
    console.error('\n❌ Setup error:', error.message);
    process.exit(1);
  });
}
