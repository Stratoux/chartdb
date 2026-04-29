import express from 'express';
import cors from 'cors';
import { store } from './store.js';
import { acquireLock, heartbeat, releaseLock, assertLockHeld } from './locks.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3001;

function parseIncludes(query) {
    const flag = (k) => query[k] === 'true' || query[k] === '1';
    return {
        includeTables: flag('includeTables'),
        includeRelationships: flag('includeRelationships'),
        includeDependencies: flag('includeDependencies'),
        includeAreas: flag('includeAreas'),
        includeCustomTypes: flag('includeCustomTypes'),
        includeNotes: flag('includeNotes'),
    };
}

function clientId(req) {
    return req.header('X-Client-Id') || '';
}

function requireLock(req, res, next) {
    const id = req.params.diagramId;
    try {
        assertLockHeld(id, clientId(req));
        next();
    } catch (err) {
        res.status(err.status || 500).json({
            error: err.message,
            code: err.code,
            heldBy: err.heldBy,
        });
    }
}

// ---------- Locks ----------
app.post('/api/diagrams/:diagramId/lock', (req, res) => {
    const result = acquireLock(req.params.diagramId, clientId(req));
    res.status(result.ok ? 200 : 409).json(result);
});

app.post('/api/diagrams/:diagramId/lock/heartbeat', (req, res) => {
    const result = heartbeat(req.params.diagramId, clientId(req));
    res.status(result.ok ? 200 : 409).json(result);
});

app.delete('/api/diagrams/:diagramId/lock', (req, res) => {
    const result = releaseLock(req.params.diagramId, clientId(req));
    res.json(result);
});

// ---------- Config ----------
app.get('/api/config', (req, res) => {
    res.json(store.getConfig() ?? null);
});

app.patch('/api/config', (req, res) => {
    store.updateConfig(req.body ?? {});
    res.json({ ok: true });
});

// ---------- Diagram filters ----------
app.get('/api/diagrams/:diagramId/filter', (req, res) => {
    const filter = store.getFilter(req.params.diagramId);
    res.json(filter ?? null);
});

app.put('/api/diagrams/:diagramId/filter', (req, res) => {
    store.upsertFilter(req.params.diagramId, req.body ?? {});
    res.json({ ok: true });
});

app.delete('/api/diagrams/:diagramId/filter', (req, res) => {
    store.deleteFilter(req.params.diagramId);
    res.json({ ok: true });
});

// ---------- Diagrams ----------
app.get('/api/diagrams', (req, res) => {
    res.json(store.listDiagrams(parseIncludes(req.query)));
});

app.get('/api/diagrams/:diagramId', (req, res) => {
    const d = store.getDiagram(req.params.diagramId, parseIncludes(req.query));
    if (!d) return res.status(404).json({ error: 'Not found' });
    res.json(d);
});

app.post('/api/diagrams', (req, res) => {
    const diagram = req.body;
    if (!diagram?.id) return res.status(400).json({ error: 'id required' });
    store.addDiagram(diagram);
    res.json({ ok: true });
});

app.patch('/api/diagrams/:diagramId', (req, res) => {
    // Diagram-level updates (rename, change type, etc) require holding the lock.
    try {
        assertLockHeld(req.params.diagramId, clientId(req));
    } catch (err) {
        return res.status(err.status || 500).json({
            error: err.message,
            code: err.code,
            heldBy: err.heldBy,
        });
    }
    const ok = store.updateDiagram(req.params.diagramId, req.body ?? {});
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});

app.delete('/api/diagrams/:diagramId', (req, res) => {
    store.deleteDiagram(req.params.diagramId);
    res.json({ ok: true });
});

// ---------- Generic collection routes ----------
const COLLECTIONS = {
    tables: 'tables',
    relationships: 'relationships',
    dependencies: 'dependencies',
    areas: 'areas',
    'custom-types': 'customTypes',
    notes: 'notes',
};

for (const [route, key] of Object.entries(COLLECTIONS)) {
    app.get(`/api/diagrams/:diagramId/${route}`, (req, res) => {
        res.json(store.listCollection(req.params.diagramId, key));
    });

    app.get(`/api/diagrams/:diagramId/${route}/:itemId`, (req, res) => {
        const item = store.getItem(req.params.diagramId, key, req.params.itemId);
        if (!item) return res.status(404).json({ error: 'Not found' });
        res.json(item);
    });

    app.post(`/api/diagrams/:diagramId/${route}`, requireLock, (req, res) => {
        try {
            store.addItem(req.params.diagramId, key, req.body);
            res.json({ ok: true });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    app.put(`/api/diagrams/:diagramId/${route}/:itemId`, requireLock, (req, res) => {
        try {
            store.putItem(req.params.diagramId, key, {
                ...req.body,
                id: req.params.itemId,
            });
            res.json({ ok: true });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message });
        }
    });

    app.patch(
        `/api/diagrams/:diagramId/${route}/:itemId`,
        requireLock,
        (req, res) => {
            const ok = store.updateItem(
                req.params.diagramId,
                key,
                req.params.itemId,
                req.body ?? {}
            );
            if (!ok) return res.status(404).json({ error: 'Not found' });
            res.json({ ok: true });
        }
    );

    app.delete(
        `/api/diagrams/:diagramId/${route}/:itemId`,
        requireLock,
        (req, res) => {
            store.deleteItem(req.params.diagramId, key, req.params.itemId);
            res.json({ ok: true });
        }
    );

    app.delete(`/api/diagrams/:diagramId/${route}`, requireLock, (req, res) => {
        store.deleteCollection(req.params.diagramId, key);
        res.json({ ok: true });
    });

    // Update item by ID alone (the storage interface exposes update without diagramId)
    app.patch(`/api/${route}/:itemId`, (req, res) => {
        const ok = store.updateItemAcrossDiagrams(
            key,
            req.params.itemId,
            req.body ?? {}
        );
        if (!ok) return res.status(404).json({ error: 'Not found' });
        res.json({ ok: true });
    });
}

app.listen(PORT, () => {
    console.log(`chartdb-server listening on http://localhost:${PORT}`);
});
