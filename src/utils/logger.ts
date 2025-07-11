import winston from 'winston';
import { Writable } from 'stream';
import { loggingConfig } from '../config/index.js';

// Check if logging should be disabled for MCP protocol compliance
const isLoggingDisabled = process.env.DISABLE_LOGGING === 'true' || process.env.MCP_MODE === 'true';

// Create logger instance
const logger = winston.createLogger({
  level: isLoggingDisabled ? 'error' : loggingConfig.level,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'search-mcp-server' },
  transports: isLoggingDisabled ? [
    // Null transport to prevent winston warnings
    new winston.transports.Stream({
      stream: new Writable({ write() {} })
    })
  ] : [
    // Console transport - write to stderr to avoid interfering with MCP JSON-RPC on stdout
    new winston.transports.Console({
      stderrLevels: ['error', 'warn', 'info', 'debug'],
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${service}] ${level}: ${message} ${metaStr}`;
        })
      )
    })
  ]
});

// Add file transport if configured
if (loggingConfig.file) {
  logger.add(new winston.transports.File({
    filename: loggingConfig.file,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }));
}

// Create child loggers for different modules
export const createLogger = (module: string) => {
  return logger.child({ module });
};

// Export default logger
export default logger;

// Utility functions for structured logging
export const logSearchOperation = (operationId: string, action: string, data?: any) => {
  logger.info(`Search operation ${action}`, {
    operationId,
    action,
    ...data
  });
};

export const logAPICall = (provider: string, endpoint: string, duration: number, success: boolean, error?: string) => {
  const level = success ? 'info' : 'error';
  logger.log(level, `API call to ${provider}`, {
    provider,
    endpoint,
    duration,
    success,
    error
  });
};

export const logRateLimit = (provider: string, action: string, resetTime?: Date) => {
  logger.warn(`Rate limit hit for ${provider}`, {
    provider,
    action,
    resetTime
  });
};

export const logError = (error: Error, context?: any) => {
  logger.error('Error occurred', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    context
  });
};

export const logPerformance = (operation: string, duration: number, metadata?: any) => {
  logger.info(`Performance metric: ${operation}`, {
    operation,
    duration,
    ...metadata
  });
};