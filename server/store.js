import { db } from './db.js';

const COLLECTIONS = [
    'tables',
    'relationships',
    'dependencies',
    'areas',
    'customTypes',
    'notes',
];

const getStmt = db.prepare('SELECT data FROM diagrams WHERE id = ?');
const listStmt = db.prepare('SELECT data FROM diagrams ORDER BY rowid');
const insertStmt = db.prepare(
    'INSERT INTO diagrams (id, data, updated_at) VALUES (?, ?, ?)'
);
const updateStmt = db.prepare(
    'UPDATE diagrams SET data = ?, updated_at = ? WHERE id = ?'
);
const deleteStmt = db.prepare('DELETE FROM diagrams WHERE id = ?');

const getFilterStmt = db.prepare(
    'SELECT data FROM diagram_filters WHERE diagram_id = ?'
);
const upsertFilterStmt = db.prepare(
    'INSERT INTO diagram_filters (diagram_id, data) VALUES (?, ?) ON CONFLICT(diagram_id) DO UPDATE SET data = excluded.data'
);
const deleteFilterStmt = db.prepare(
    'DELETE FROM diagram_filters WHERE diagram_id = ?'
);

const getConfigStmt = db.prepare('SELECT data FROM config WHERE id = 1');
const updateConfigStmt = db.prepare(
    'UPDATE config SET data = ? WHERE id = 1'
);

function readDiagram(id) {
    const row = getStmt.get(id);
    if (!row) return null;
    return JSON.parse(row.data);
}

function writeDiagram(diagram) {
    const json = JSON.stringify(diagram);
    const existing = getStmt.get(diagram.id);
    const now = Date.now();
    if (existing) {
        updateStmt.run(json, now, diagram.id);
    } else {
        insertStmt.run(diagram.id, json, now);
    }
}

function ensureCollections(diagram) {
    for (const c of COLLECTIONS) {
        if (!Array.isArray(diagram[c])) diagram[c] = [];
    }
    return diagram;
}

function pickIncludes(diagram, options) {
    const out = {
        id: diagram.id,
        name: diagram.name,
        databaseType: diagram.databaseType,
        databaseEdition: diagram.databaseEdition,
        createdAt: diagram.createdAt,
        updatedAt: diagram.updatedAt,
    };
    if (options.includeTables) out.tables = diagram.tables ?? [];
    if (options.includeRelationships)
        out.relationships = (diagram.relationships ?? []).slice().sort((a, b) =>
            a.name.localeCompare(b.name)
        );
    if (options.includeDependencies) out.dependencies = diagram.dependencies ?? [];
    if (options.includeAreas) out.areas = diagram.areas ?? [];
    if (options.includeCustomTypes)
        out.customTypes = (diagram.customTypes ?? []).slice().sort((a, b) =>
            a.name.localeCompare(b.name)
        );
    if (options.includeNotes) out.notes = diagram.notes ?? [];
    return out;
}

export const store = {
    listDiagrams(options = {}) {
        const rows = listStmt.all();
        return rows
            .map((r) => JSON.parse(r.data))
            .map((d) => pickIncludes(d, options));
    },

    getDiagram(id, options = {}) {
        const d = readDiagram(id);
        if (!d) return null;
        return pickIncludes(d, options);
    },

    addDiagram(diagram) {
        const full = ensureCollections({ ...diagram });
        writeDiagram(full);
    },

    updateDiagram(id, attributes) {
        const d = readDiagram(id);
        if (!d) return false;
        const merged = { ...d, ...attributes };
        if (attributes.id && attributes.id !== id) {
            // ID changed: insert under new ID and delete old.
            writeDiagram(merged);
            deleteStmt.run(id);
        } else {
            writeDiagram(merged);
        }
        return true;
    },

    deleteDiagram(id) {
        deleteStmt.run(id);
        deleteFilterStmt.run(id);
    },

    // ------ collection helpers ------
    listCollection(diagramId, key) {
        const d = readDiagram(diagramId);
        if (!d) return [];
        const items = d[key] ?? [];
        if (key === 'relationships' || key === 'customTypes') {
            return items.slice().sort((a, b) => a.name.localeCompare(b.name));
        }
        return items;
    },

    getItem(diagramId, key, itemId) {
        const d = readDiagram(diagramId);
        if (!d) return null;
        return (d[key] ?? []).find((i) => i.id === itemId) ?? null;
    },

    addItem(diagramId, key, item) {
        const d = readDiagram(diagramId);
        if (!d) {
            const err = new Error(`Diagram ${diagramId} not found`);
            err.status = 404;
            throw err;
        }
        ensureCollections(d);
        d[key].push(item);
        writeDiagram(d);
    },

    putItem(diagramId, key, item) {
        const d = readDiagram(diagramId);
        if (!d) {
            const err = new Error(`Diagram ${diagramId} not found`);
            err.status = 404;
            throw err;
        }
        ensureCollections(d);
        const idx = d[key].findIndex((i) => i.id === item.id);
        if (idx >= 0) d[key][idx] = item;
        else d[key].push(item);
        writeDiagram(d);
    },

    updateItem(diagramId, key, itemId, attributes) {
        const d = readDiagram(diagramId);
        if (!d) return false;
        ensureCollections(d);
        const idx = d[key].findIndex((i) => i.id === itemId);
        if (idx < 0) return false;
        d[key][idx] = { ...d[key][idx], ...attributes };
        writeDiagram(d);
        return true;
    },

    deleteItem(diagramId, key, itemId) {
        const d = readDiagram(diagramId);
        if (!d) return;
        ensureCollections(d);
        d[key] = d[key].filter((i) => i.id !== itemId);
        writeDiagram(d);
    },

    deleteCollection(diagramId, key) {
        const d = readDiagram(diagramId);
        if (!d) return;
        d[key] = [];
        writeDiagram(d);
    },

    // updateItem when only an id is known (no diagramId in API)
    updateItemAcrossDiagrams(key, itemId, attributes) {
        const rows = listStmt.all();
        for (const row of rows) {
            const d = JSON.parse(row.data);
            if (!Array.isArray(d[key])) continue;
            const idx = d[key].findIndex((i) => i.id === itemId);
            if (idx >= 0) {
                d[key][idx] = { ...d[key][idx], ...attributes };
                writeDiagram(d);
                return true;
            }
        }
        return false;
    },

    // ------ config ------
    getConfig() {
        const row = getConfigStmt.get();
        return row ? JSON.parse(row.data) : undefined;
    },

    updateConfig(partial) {
        const current = JSON.parse(getConfigStmt.get().data);
        updateConfigStmt.run(JSON.stringify({ ...current, ...partial }));
    },

    // ------ filters ------
    getFilter(diagramId) {
        const row = getFilterStmt.get(diagramId);
        return row ? JSON.parse(row.data) : undefined;
    },

    upsertFilter(diagramId, filter) {
        upsertFilterStmt.run(
            diagramId,
            JSON.stringify({ ...filter, diagramId })
        );
    },

    deleteFilter(diagramId) {
        deleteFilterStmt.run(diagramId);
    },
};
