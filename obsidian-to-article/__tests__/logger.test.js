import { jest } from '@jest/globals';
import path from 'path';
import { logger, colors, logSuccess, logError, logWarning, logInfo, logDim, logBold } from '../logger.js';

describe('Logger', () => {
  describe('Logger class', () => {
    test('initializes log file on construction', () => {
      expect(logger).toBeDefined();
      expect(logger.logFile).toContain('obsidian-converter.log');
    });

    test('log file path is in current working directory', () => {
      const expectedPath = path.join(process.cwd(), 'obsidian-converter.log');
      expect(logger.logFile).toBe(expectedPath);
    });

    test('has info method', () => {
      expect(typeof logger.info).toBe('function');
    });

    test('has error method', () => {
      expect(typeof logger.error).toBe('function');
    });

    test('has warn method', () => {
      expect(typeof logger.warn).toBe('function');
    });

    test('has debug method', () => {
      expect(typeof logger.debug).toBe('function');
    });

    test('info returns a promise', () => {
      const result = logger.info('Test message');
      expect(result).toBeInstanceOf(Promise);
    });

    test('error returns a promise', () => {
      const result = logger.error('Test message');
      expect(result).toBeInstanceOf(Promise);
    });

    test('warn returns a promise', () => {
      const result = logger.warn('Test message');
      expect(result).toBeInstanceOf(Promise);
    });

    test('debug returns a promise', () => {
      const result = logger.debug('Test message');
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('colors object', () => {
    test('exports all color functions', () => {
      expect(colors).toBeDefined();
      expect(typeof colors.success).toBe('function');
      expect(typeof colors.error).toBe('function');
      expect(typeof colors.warning).toBe('function');
      expect(typeof colors.info).toBe('function');
      expect(typeof colors.dim).toBe('function');
      expect(typeof colors.bold).toBe('function');
      expect(typeof colors.cyan).toBe('function');
      expect(typeof colors.magenta).toBe('function');
    });

    test('color functions return strings', () => {
      expect(typeof colors.success('test')).toBe('string');
      expect(typeof colors.error('test')).toBe('string');
      expect(typeof colors.warning('test')).toBe('string');
      expect(typeof colors.info('test')).toBe('string');
      expect(typeof colors.dim('test')).toBe('string');
      expect(typeof colors.bold('test')).toBe('string');
      expect(typeof colors.cyan('test')).toBe('string');
      expect(typeof colors.magenta('test')).toBe('string');
    });

    test('color functions apply styling or return plain text', () => {
      const plain = 'test';
      const styled = colors.success(plain);
      // Styled string should be a string (may or may not have ANSI codes depending on environment)
      expect(typeof styled).toBe('string');
      expect(styled.length).toBeGreaterThanOrEqual(plain.length);
    });
  });

  describe('console logging functions', () => {
    let consoleLogSpy;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    test('logSuccess logs to console', () => {
      logSuccess('Success message');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    test('logError logs to console', () => {
      logError('Error message');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    test('logWarning logs to console', () => {
      logWarning('Warning message');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    test('logInfo logs to console', () => {
      logInfo('Info message');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    test('logDim logs to console', () => {
      logDim('Dim message');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    test('logBold logs to console', () => {
      logBold('Bold message');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    test('logSuccess uses success color', () => {
      logSuccess('Success');
      const logged = consoleLogSpy.mock.calls[0][0];
      // Should be a string (may or may not have ANSI color codes)
      expect(typeof logged).toBe('string');
      expect(logged.length).toBeGreaterThanOrEqual('Success'.length);
    });

    test('logError uses error color', () => {
      logError('Error');
      const logged = consoleLogSpy.mock.calls[0][0];
      expect(typeof logged).toBe('string');
      expect(logged.length).toBeGreaterThanOrEqual('Error'.length);
    });
  });
});
