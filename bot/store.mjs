import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Store {
  constructor(path = './data/poker.sqlite') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, session_id TEXT, created INTEGER NOT NULL)');
  }
  get(id) { const row = this.db.prepare('SELECT data FROM sessions WHERE id=?').get(id); return row ? JSON.parse(row.data) : null; }
  save(session) { this.db.prepare('INSERT INTO sessions VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated=excluded.updated').run(session.id, JSON.stringify(session), Date.now()); }
  all() { return this.db.prepare('SELECT data FROM sessions').all().map(r => JSON.parse(r.data)); }
  seen(key) { return this.db.prepare('SELECT session_id FROM events WHERE id=?').get(key); }
  remember(key, id) { this.db.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?)').run(key, id, Date.now()); }
  prune(now = Date.now()) {
    const cutoff = now - 7 * 86400000;
    this.db.prepare('DELETE FROM sessions WHERE updated<?').run(cutoff);
    this.db.prepare('DELETE FROM events WHERE created<?').run(cutoff);
  }
  close() { this.db.close(); }
}
