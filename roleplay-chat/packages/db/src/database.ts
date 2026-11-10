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
  if (!chatColumns.some((column) => column.name === 'script_id')) {
    db.exec('ALTER TABLE chats ADD COLUMN script_id TEXT;');
    db.exec('ALTER TABLE chats ADD COLUMN script_snapshot TEXT;');
  }
  const memoryMigrations: [string, string][] = [
    ['memory_summary', 'ALTER TABLE chats ADD COLUMN memory_summary TEXT;'],
    ['memory_through_message_id', 'ALTER TABLE chats ADD COLUMN memory_through_message_id TEXT;'],
    ['memory_updated_at', 'ALTER TABLE chats ADD COLUMN memory_updated_at TEXT;'],
  ];
  for (const [column, sql] of memoryMigrations) {
    if (!chatColumns.some((item) => item.name === column)) db.exec(sql);
  }
  const characterColumns = db.prepare('PRAGMA table_info(characters)').all() as unknown as { name: string }[];
  const characterMigrations: [string, string][] = [
    ['example_dialogue', "ALTER TABLE characters ADD COLUMN example_dialogue TEXT NOT NULL DEFAULT '';"],
    ['alternate_greetings', 'ALTER TABLE characters ADD COLUMN alternate_greetings TEXT;'],
    ['tags', 'ALTER TABLE characters ADD COLUMN tags TEXT;'],
    ['raw_extensions', 'ALTER TABLE characters ADD COLUMN raw_extensions TEXT;'],
    ['script_id', 'ALTER TABLE characters ADD COLUMN script_id TEXT;'],
  ];
  for (const [column, sql] of characterMigrations) {
    if (!characterColumns.some((item) => item.name === column)) db.exec(sql);
  }
  return db;
}
