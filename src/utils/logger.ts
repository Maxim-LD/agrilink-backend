import { SystemLog } from '../models/SystemLog';

/**
 * Lightweight logger that outputs to the console (for stdout/stderr capture on hosting like Render)
 * and asynchronously persists log events to MongoDB.
 */
export const logger = {
  info: (message: string, meta?: any): void => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] ${message}`, meta !== undefined ? meta : '');
    
    SystemLog.create({
      level: 'info',
      message,
      metadata: meta,
    }).catch((err) => {
      console.error('[Logger Error] Failed to write info log to DB:', err.message);
    });
  },

  warn: (message: string, meta?: any): void => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [WARN] ${message}`, meta !== undefined ? meta : '');

    SystemLog.create({
      level: 'warn',
      message,
      metadata: meta,
    }).catch((err) => {
      console.error('[Logger Error] Failed to write warn log to DB:', err.message);
    });
  },

  error: (message: string, meta?: any): void => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] ${message}`, meta !== undefined ? meta : '');

    // Format Error objects to be JSON-serializable for Mixed schema type
    let formattedMeta = meta;
    if (meta instanceof Error) {
      formattedMeta = {
        name:    meta.name,
        message: meta.message,
        stack:   meta.stack,
      };
    }

    SystemLog.create({
      level: 'error',
      message,
      metadata: formattedMeta,
    }).catch((err) => {
      console.error('[Logger Error] Failed to write error log to DB:', err.message);
    });
  },
};
