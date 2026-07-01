import type { Diagram } from '@/lib/domain';
import { DatabaseType } from '@/lib/domain';
import { describe, it, expect } from 'vitest';
import { applyDBMLChanges } from '../apply-dbml';
import { importDBMLToDiagram } from '../../dbml-import/dbml-import';
import { generateDBMLFromDiagram } from '../../dbml-export/dbml-export';

const sourceDiagram: Diagram = {
    id: 'd1',
    name: 'Diagram',
    createdAt: new Date('2025-07-30T14:26:10.598Z'),
    updatedAt: new Date('2025-07-30T14:26:20.697Z'),
    databaseType: DatabaseType.POSTGRESQL,
    tables: [
        {
            id: 'table1id',
            name: 'users',
            schema: 'public',
            x: 1000,
            y: 2000,
            fields: [
                {
                    id: 'f1',
                    name: 'id',
                    type: { id: 'bigint', name: 'bigint' },
                    unique: true,
                    nullable: false,
                    primaryKey: true,
                    createdAt: 1753885573671,
                },
            ],
            indexes: [],
            color: '#42e0c0',
            createdAt: 1753885573671,
            isView: false,
            order: 0,
        },
        {
            id: 'table2id',
            name: 'posts',
            schema: 'public',
            x: 3000,
            y: 4000,
            fields: [
                {
                    id: 'f2',
                    name: 'id',
                    type: { id: 'bigint', name: 'bigint' },
                    unique: true,
                    nullable: false,
                    primaryKey: true,
                    createdAt: 1753885573671,
                },
            ],
            indexes: [],
            color: '#42e0c0',
            createdAt: 1753885573671,
            isView: false,
            order: 1,
        },
    ],
    relationships: [],
    dependencies: [],
    areas: [],
    customTypes: [],
};

// Simulates the full editor flow: export -> user edits DBML -> import -> apply.
describe('applyDBMLChanges preserves layout on DBML edits', () => {
    it('keeps x/y of unchanged tables when a field is added', async () => {
        const { inlineDbml } = generateDBMLFromDiagram(sourceDiagram);
        const editedDbml = inlineDbml.replace(
            '"id" bigint [pk, not null]',
            '"id" bigint [pk, not null]\n  "email" varchar'
        );

        const diagramFromDBML = await importDBMLToDiagram(editedDbml, {
            databaseType: DatabaseType.POSTGRESQL,
        });

        const newDiagram = applyDBMLChanges({
            sourceDiagram,
            targetDiagram: {
                ...sourceDiagram,
                tables: diagramFromDBML.tables,
                relationships: diagramFromDBML.relationships,
                customTypes: diagramFromDBML.customTypes,
            },
        });

        const users = newDiagram.tables?.find((t) => t.name === 'users');
        const posts = newDiagram.tables?.find((t) => t.name === 'posts');
        expect(users?.x).toBe(1000);
        expect(users?.y).toBe(2000);
        expect(posts?.x).toBe(3000);
        expect(posts?.y).toBe(4000);
    });

    it('does not send a renamed table to the origin and keeps other tables put', async () => {
        const { inlineDbml } = generateDBMLFromDiagram(sourceDiagram);
        const editedDbml = inlineDbml.replace(
            '"public"."users"',
            '"public"."accounts"'
        );

        const diagramFromDBML = await importDBMLToDiagram(editedDbml, {
            databaseType: DatabaseType.POSTGRESQL,
        });

        const newDiagram = applyDBMLChanges({
            sourceDiagram,
            targetDiagram: {
                ...sourceDiagram,
                tables: diagramFromDBML.tables,
                relationships: diagramFromDBML.relationships,
                customTypes: diagramFromDBML.customTypes,
            },
        });

        const accounts = newDiagram.tables?.find((t) => t.name === 'accounts');
        const posts = newDiagram.tables?.find((t) => t.name === 'posts');
        // Unchanged table stays exactly where it was.
        expect(posts?.x).toBe(3000);
        expect(posts?.y).toBe(4000);
        // Renamed table is treated as new but spawns next to the existing
        // layout (to the right of the bounding box) rather than at (0, 0).
        expect(accounts?.x).not.toBe(0);
        expect(accounts?.x).toBeGreaterThanOrEqual(3000);
    });
});
