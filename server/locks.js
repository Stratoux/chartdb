import { db } from './db.js';

export const LOCK_TTL_MS = 30_000;

const getStmt = db.prepare('SELECT * FROM locks WHERE diagram_id = ?');
const insertStmt = db.prepare(
    'INSERT INTO locks (diagram_id, client_id, acquired_at, last_heartbeat) VALUES (?, ?, ?, ?)'
);
const heartbeatStmt = db.prepare(
    'UPDATE locks SET last_heartbeat = ? WHERE diagram_id = ? AND client_id = ?'
);
const stealStmt = db.prepare(
    'UPDATE locks SET client_id = ?, acquired_at = ?, last_heartbeat = ? WHERE diagram_id = ?'
);
const deleteStmt = db.prepare(
    'DELETE FROM locks WHERE diagram_id = ? AND client_id = ?'
);

function isExpired(lock, now) {
    return now - lock.last_heartbeat > LOCK_TTL_MS;
}

export function acquireLock(diagramId, clientId) {
    const now = Date.now();
    const existing = getStmt.get(diagramId);

    if (!existing) {
        insertStmt.run(diagramId, clientId, now, now);
        return { ok: true, clientId, acquiredAt: now, ttlMs: LOCK_TTL_MS };
    }

    if (existing.client_id === clientId) {
        heartbeatStmt.run(now, diagramId, clientId);
        return { ok: true, clientId, acquiredAt: existing.acquired_at, ttlMs: LOCK_TTL_MS };
    }

    if (isExpired(existing, now)) {
        stealStmt.run(clientId, now, now, diagramId);
        return { ok: true, clientId, acquiredAt: now, ttlMs: LOCK_TTL_MS };
    }

    return {
        ok: false,
        heldBy: existing.client_id,
        expiresAt: existing.last_heartbeat + LOCK_TTL_MS,
    };
}

export function heartbeat(diagramId, clientId) {
    const now = Date.now();
    const existing = getStmt.get(diagramId);
    if (!existing || existing.client_id !== clientId) {
        return { ok: false };
    }
    heartbeatStmt.run(now, diagramId, clientId);
    return { ok: true, ttlMs: LOCK_TTL_MS };
}

export function releaseLock(diagramId, clientId) {
    deleteStmt.run(diagramId, clientId);
    return { ok: true };
}

export function assertLockHeld(diagramId, clientId) {
    if (!clientId) {
        const err = new Error('Missing X-Client-Id header');
        err.status = 400;
        throw err;
    }
    const existing = getStmt.get(diagramId);
    if (!existing) {
        const err = new Error(`No lock held for diagram ${diagramId}`);
        err.status = 409;
        err.code = 'NOT_LOCKED';
        throw err;
    }
    const now = Date.now();
    if (existing.client_id !== clientId) {
        if (isExpired(existing, now)) {
            const err = new Error(`Lock expired; reacquire required`);
            err.status = 409;
            err.code = 'LOCK_EXPIRED';
            throw err;
        }
        const err = new Error(`Diagram is locked by another client`);
        err.status = 409;
        err.code = 'LOCKED_BY_OTHER';
        err.heldBy = existing.client_id;
        throw err;
    }
    if (isExpired(existing, now)) {
        const err = new Error(`Lock expired; reacquire required`);
        err.status = 409;
        err.code = 'LOCK_EXPIRED';
        throw err;
    }
    heartbeatStmt.run(now, diagramId, clientId);
}
