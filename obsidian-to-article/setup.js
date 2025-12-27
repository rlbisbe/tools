#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper to ask questions
function ask(question, defaultValue = '') {
  return new Promise((resolve) => {
    const prompt = defaultValue
      ? `${question} (default: ${defaultValue}): `
      : `${question}: `;

    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

// Helper to ask yes/no questions
async function askYesNo(question, defaultValue = 'yes') {
  const answer = await ask(`${question} (yes/no)`, defaultValue);
  return answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y';
}

console.log('🚀 Obsidian to Article Converter - Setup Wizard\n');
console.log('This wizard will help you configure your environment variables.\n');

async function setup() {
  const config = {};

  // Gemini Configuration
  console.log('━'.repeat(60));
  console.log('📝 GEMINI API CONFIGURATION');
  console.log('━'.repeat(60));

  const useMockGemini = await askYesNo(
    'Do you want to use MOCK Gemini service (no API key needed)?',
    'yes'
  );

  config.USE_MOCK_GEMINI = useMockGemini ? 'true' : 'false';

  if (!useMockGemini) {
    console.log('\n💡 To get a Gemini API key, visit: https://makersuite.google.com/app/apikey\n');
    const apiKey = await ask('Enter your Gemini API key');

    if (!apiKey) {
      console.log('⚠️  Warning: No API key provided. Setting USE_MOCK_GEMINI to true.');
      config.USE_MOCK_GEMINI = 'true';
    } else {
      config.GEMINI_API_KEY = apiKey;
    }
  } else {
    config.GEMINI_API_KEY = 'your_gemini_api_key_here';
  }

  // Twitter Configuration
  console.log('\n' + '━'.repeat(60));
  console.log('🐦 TWITTER API CONFIGURATION (Optional)');
  console.log('━'.repeat(60));

  const useTwitter = await askYesNo(
    'Do you want to enable Twitter/X URL support?',
    'no'
  );

  if (useTwitter) {
    console.log('\n💡 To get a Twitter Bearer Token, visit: https://developer.twitter.com/en/portal/dashboard\n');
    const twitterToken = await ask('Enter your Twitter Bearer Token (leave empty to skip)');

    if (twitterToken) {
      config.TWITTER_BEARER_TOKEN = twitterToken;
    } else {
      config.TWITTER_BEARER_TOKEN = 'your_twitter_bearer_token_here';
      console.log('ℹ️  Twitter URLs will be skipped without a valid token.');
    }
  } else {
    config.TWITTER_BEARER_TOKEN = 'your_twitter_bearer_token_here';
  }

  // Input/Output Configuration
  console.log('\n' + '━'.repeat(60));
  console.log('📁 INPUT/OUTPUT CONFIGURATION');
  console.log('━'.repeat(60));

  config.OBSIDIAN_NOTES_PATH = await ask(
    'Enter the path to your Obsidian notes directory',
    './notes'
  );

  config.OUTPUT_PATH = await ask(
    'Enter the path for output articles',
    './output'
  );

  // Processing Options
  console.log('\n' + '━'.repeat(60));
  console.log('⚙️  PROCESSING OPTIONS');
  console.log('━'.repeat(60));

  const dryRun = await askYesNo(
    'Enable DRY RUN mode (preview without writing files)?',
    'no'
  );
  config.DRY_RUN = dryRun ? 'true' : 'false';

  const deleteLinks = await askYesNo(
    'Enable AUTO-CLEANUP (remove processed links from source files)?',
    'yes'
  );
  config.DELETE_LINKS = deleteLinks ? 'true' : 'false';

  // Generate .env content
  console.log('\n' + '━'.repeat(60));
  console.log('📝 GENERATING .env FILE');
  console.log('━'.repeat(60));

  const envContent = `# Gemini API Configuration
GEMINI_API_KEY=${config.GEMINI_API_KEY}

# Set to 'true' to use mock Gemini API (for testing without API key)
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

  // Check if .env already exists
  const envPath = path.join(__dirname, '.env');
  let shouldWrite = true;

  try {
    await fs.access(envPath);
    console.log('\n⚠️  .env file already exists!');
    shouldWrite = await askYesNo('Do you want to overwrite it?', 'no');

    if (!shouldWrite) {
      // Create backup
      const backupPath = path.join(__dirname, '.env.backup');
      await fs.copyFile(envPath, backupPath);
      console.log(`✅ Current .env backed up to .env.backup`);
      shouldWrite = true;
    }
  } catch (error) {
    // .env doesn't exist, safe to create
  }

  if (shouldWrite) {
    await fs.writeFile(envPath, envContent, 'utf-8');
    console.log('\n✅ .env file created successfully!');
  } else {
    console.log('\n❌ Setup cancelled. .env file was not modified.');
  }

  // Create directories if they don't exist
  console.log('\n' + '━'.repeat(60));
  console.log('📂 CREATING DIRECTORIES');
  console.log('━'.repeat(60));

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
  console.log(`  • Gemini: ${config.USE_MOCK_GEMINI === 'true' ? 'MOCK mode' : 'REAL API'}`);
  console.log(`  • Twitter: ${config.TWITTER_BEARER_TOKEN !== 'your_twitter_bearer_token_here' ? 'ENABLED' : 'DISABLED'}`);
  console.log(`  • Notes path: ${config.OBSIDIAN_NOTES_PATH}`);
  console.log(`  • Output path: ${config.OUTPUT_PATH}`);
  console.log(`  • Dry run: ${config.DRY_RUN === 'true' ? 'ENABLED' : 'DISABLED'}`);
  console.log(`  • Auto-cleanup: ${config.DELETE_LINKS === 'true' ? 'ENABLED' : 'DISABLED'}`);

  console.log('\n📝 Next steps:');
  console.log('  1. Add your Obsidian notes to:', config.OBSIDIAN_NOTES_PATH);
  console.log('  2. Run the converter: npm start');
  console.log('  3. Check the output in:', config.OUTPUT_PATH);

  if (config.USE_MOCK_GEMINI === 'true' && !useMockGemini) {
    console.log('\n⚠️  Note: Running in MOCK mode. For better results, add a Gemini API key.');
  }

  console.log('\n✨ Happy converting!\n');

  rl.close();
}

// Run setup
setup().catch(error => {
  console.error('\n❌ Setup error:', error.message);
  rl.close();
  process.exit(1);
});
