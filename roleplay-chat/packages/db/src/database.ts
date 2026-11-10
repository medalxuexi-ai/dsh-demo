import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL } from './schema.js';

export function openDatabase(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA_SQL);
  const chatColumns = db.prepare('PRAGMA table_info(chats)').all() as unknown as { name: string }[];
  if (!chatColumns.some((column) => column.name === 'persona_id')) {
    db.exec('ALTER TABLE chats ADD COLUMN persona_id TEXT;');
  }
  return db;
}
