import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

class Logger {
  constructor() {
    this.logFile = path.join(process.cwd(), 'obsidian-converter.log');
    this.initLog();
  }

  async initLog() {
    const timestamp = new Date().toISOString();
    await fs.writeFile(this.logFile, `=== Obsidian Converter Log - ${timestamp} ===\n`, 'utf-8');
  }

  async log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    let logEntry = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    
    if (data) {
      logEntry += `\nData: ${JSON.stringify(data, null, 2)}`;
    }
    
    logEntry += '\n';
    
    try {
      await fs.appendFile(this.logFile, logEntry, 'utf-8');
    } catch (error) {
      // Fallback to console if file logging fails
      console.error('Failed to write to log file:', error.message);
    }
  }

  info(message, data = null) {
    return this.log('info', message, data);
  }

  error(message, data = null) {
    return this.log('error', message, data);
  }

  warn(message, data = null) {
    return this.log('warn', message, data);
  }

  debug(message, data = null) {
    return this.log('debug', message, data);
  }
}

// Console output with colors
export const logger = new Logger();

export const colors = {
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  dim: chalk.dim,
  bold: chalk.bold,
  cyan: chalk.cyan,
  magenta: chalk.magenta
};

export function logSuccess(message) {
  console.log(colors.success(message));
}

export function logError(message) {
  console.log(colors.error(message));
}

export function logWarning(message) {
  console.log(colors.warning(message));
}

export function logInfo(message) {
  console.log(colors.info(message));
}

export function logDim(message) {
  console.log(colors.dim(message));
}

export function logBold(message) {
  console.log(colors.bold(message));
}
