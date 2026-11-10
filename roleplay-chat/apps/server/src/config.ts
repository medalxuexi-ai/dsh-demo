import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  dbFile: string;
  masterKeyPath: string;
  webDist: string;
  logger: boolean;
  logLevel: string;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR ?? path.join(serverRoot, '../../data'));
  return {
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 8787),
    dataDir,
    dbFile: path.join(dataDir, 'app.db'),
    masterKeyPath: path.join(dataDir, '.master.key'),
    webDist: path.join(serverRoot, '../web/dist'),
    logger: true,
    logLevel: process.env.LOG_LEVEL ?? 'info',
    ...overrides,
  };
}
