import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.CHARTDB_DB_PATH || path.join(__dirname, 'chartdb.sqlite');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
    CREATE TABLE IF NOT EXISTS diagrams (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS diagram_filters (
        diagram_id TEXT PRIMARY KEY,
        data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS locks (
        diagram_id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        acquired_at INTEGER NOT NULL,
        last_heartbeat INTEGER NOT NULL
    );
`);

const configRow = db.prepare('SELECT data FROM config WHERE id = 1').get();
if (!configRow) {
    db.prepare('INSERT INTO config (id, data) VALUES (1, ?)').run(
        JSON.stringify({ defaultDiagramId: '' })
    );
}
