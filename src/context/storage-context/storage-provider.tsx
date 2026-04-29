import React, { useCallback } from 'react';
import type { StorageContext } from './storage-context';
import { storageContext } from './storage-context';
import type { Diagram } from '@/lib/domain/diagram';
import type { DBTable } from '@/lib/domain/db-table';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import type { ChartDBConfig } from '@/lib/domain/config';
import type { DBDependency } from '@/lib/domain/db-dependency';
import type { Area } from '@/lib/domain/area';
import type { DBCustomType } from '@/lib/domain/db-custom-type';
import type { DiagramFilter } from '@/lib/domain/diagram-filter/diagram-filter';
import type { Note } from '@/lib/domain/note';
import { apiFetch, buildQuery, reviveDates } from '@/lib/api/client';

export const StorageProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const getConfig: StorageContext['getConfig'] = useCallback(async () => {
        const data = await apiFetch<ChartDBConfig | null>('/config');
        return data ?? undefined;
    }, []);

    const updateConfig: StorageContext['updateConfig'] = useCallback(
        async (config) => {
            await apiFetch('/config', {
                method: 'PATCH',
                body: JSON.stringify(config),
            });
        },
        []
    );

    const getDiagramFilter: StorageContext['getDiagramFilter'] = useCallback(
        async (diagramId) => {
            const data = await apiFetch<DiagramFilter | null>(
                `/diagrams/${diagramId}/filter`
            );
            return data ?? undefined;
        },
        []
    );

    const updateDiagramFilter: StorageContext['updateDiagramFilter'] =
        useCallback(async (diagramId, filter) => {
            await apiFetch(`/diagrams/${diagramId}/filter`, {
                method: 'PUT',
                body: JSON.stringify(filter),
            });
        }, []);

    const deleteDiagramFilter: StorageContext['deleteDiagramFilter'] =
        useCallback(async (diagramId) => {
            await apiFetch(`/diagrams/${diagramId}/filter`, {
                method: 'DELETE',
            });
        }, []);

    // ---- Tables ----
    const addTable: StorageContext['addTable'] = useCallback(
        async ({ diagramId, table }) => {
            await apiFetch(`/diagrams/${diagramId}/tables`, {
                method: 'POST',
                body: JSON.stringify(table),
            });
        },
        []
    );

    const getTable: StorageContext['getTable'] = useCallback(
        async ({ diagramId, id }) => {
            try {
                const data = await apiFetch<DBTable>(
                    `/diagrams/${diagramId}/tables/${id}`
                );
                return reviveDates(data);
            } catch {
                return undefined;
            }
        },
        []
    );

    const updateTable: StorageContext['updateTable'] = useCallback(
        async ({ id, attributes }) => {
            await apiFetch(`/tables/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(attributes),
            });
        },
        []
    );

    const putTable: StorageContext['putTable'] = useCallback(
        async ({ diagramId, table }) => {
            await apiFetch(`/diagrams/${diagramId}/tables/${table.id}`, {
                method: 'PUT',
                body: JSON.stringify(table),
            });
        },
        []
    );

    const deleteTable: StorageContext['deleteTable'] = useCallback(
        async ({ diagramId, id }) => {
            await apiFetch(`/diagrams/${diagramId}/tables/${id}`, {
                method: 'DELETE',
            });
        },
        []
    );

    const listTables: StorageContext['listTables'] = useCallback(
        async (diagramId) => {
            const data = await apiFetch<DBTable[]>(
                `/diagrams/${diagramId}/tables`
            );
            return reviveDates(data);
        },
        []
    );

    const deleteDiagramTables: StorageContext['deleteDiagramTables'] =
        useCallback(async (diagramId) => {
            await apiFetch(`/diagrams/${diagramId}/tables`, {
                method: 'DELETE',
            });
        }, []);

    // ---- Relationships ----
    const addRelationship: StorageContext['addRelationship'] = useCallback(
        async ({ diagramId, relationship }) => {
            await apiFetch(`/diagrams/${diagramId}/relationships`, {
                method: 'POST',
                body: JSON.stringify(relationship),
            });
        },
        []
    );

    const getRelationship: StorageContext['getRelationship'] = useCallback(
        async ({ diagramId, id }) => {
            try {
                return await apiFetch<DBRelationship>(
                    `/diagrams/${diagramId}/relationships/${id}`
                );
            } catch {
                return undefined;
            }
        },
        []
    );

    const updateRelationship: StorageContext['updateRelationship'] =
        useCallback(async ({ id, attributes }) => {
            await apiFetch(`/relationships/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(attributes),
            });
        }, []);

    const deleteRelationship: StorageContext['deleteRelationship'] =
        useCallback(async ({ diagramId, id }) => {
            await apiFetch(`/diagrams/${diagramId}/relationships/${id}`, {
                method: 'DELETE',
            });
        }, []);

    const listRelationships: StorageContext['listRelationships'] = useCallback(
        async (diagramId) => {
            return await apiFetch<DBRelationship[]>(
                `/diagrams/${diagramId}/relationships`
            );
        },
        []
    );

    const deleteDiagramRelationships: StorageContext['deleteDiagramRelationships'] =
        useCallback(async (diagramId) => {
            await apiFetch(`/diagrams/${diagramId}/relationships`, {
                method: 'DELETE',
            });
        }, []);

    // ---- Dependencies ----
    const addDependency: StorageContext['addDependency'] = useCallback(
        async ({ diagramId, dependency }) => {
            await apiFetch(`/diagrams/${diagramId}/dependencies`, {
                method: 'POST',
                body: JSON.stringify(dependency),
            });
        },
        []
    );

    const getDependency: StorageContext['getDependency'] = useCallback(
        async ({ diagramId, id }) => {
            try {
                const data = await apiFetch<DBDependency>(
                    `/diagrams/${diagramId}/dependencies/${id}`
                );
                return reviveDates(data);
            } catch {
                return undefined;
            }
        },
        []
    );

    const updateDependency: StorageContext['updateDependency'] = useCallback(
        async ({ id, attributes }) => {
            await apiFetch(`/dependencies/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(attributes),
            });
        },
        []
    );

    const deleteDependency: StorageContext['deleteDependency'] = useCallback(
        async ({ diagramId, id }) => {
            await apiFetch(`/diagrams/${diagramId}/dependencies/${id}`, {
                method: 'DELETE',
            });
        },
        []
    );

    const listDependencies: StorageContext['listDependencies'] = useCallback(
        async (diagramId) => {
            const data = await apiFetch<DBDependency[]>(
                `/diagrams/${diagramId}/dependencies`
            );
            return reviveDates(data);
        },
        []
    );

    const deleteDiagramDependencies: StorageContext['deleteDiagramDependencies'] =
        useCallback(async (diagramId) => {
            await apiFetch(`/diagrams/${diagramId}/dependencies`, {
                method: 'DELETE',
            });
        }, []);

    // ---- Areas ----
    const addArea: StorageContext['addArea'] = useCallback(
        async ({ diagramId, area }) => {
            await apiFetch(`/diagrams/${diagramId}/areas`, {
                method: 'POST',
                body: JSON.stringify(area),
            });
        },
        []
    );

    const getArea: StorageContext['getArea'] = useCallback(
        async ({ diagramId, id }) => {
            try {
                return await apiFetch<Area>(
                    `/diagrams/${diagramId}/areas/${id}`
                );
            } catch {
                return undefined;
            }
        },
        []
    );

    const updateArea: StorageContext['updateArea'] = useCallback(
        async ({ id, attributes }) => {
            await apiFetch(`/areas/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(attributes),
            });
        },
        []
    );

    const deleteArea: StorageContext['deleteArea'] = useCallback(
        async ({ diagramId, id }) => {
            await apiFetch(`/diagrams/${diagramId}/areas/${id}`, {
                method: 'DELETE',
            });
        },
        []
    );

    const listAreas: StorageContext['listAreas'] = useCallback(
        async (diagramId) => {
            return await apiFetch<Area[]>(`/diagrams/${diagramId}/areas`);
        },
        []
    );

    const deleteDiagramAreas: StorageContext['deleteDiagramAreas'] =
        useCallback(async (diagramId) => {
            await apiFetch(`/diagrams/${diagramId}/areas`, {
                method: 'DELETE',
            });
        }, []);

    // ---- Custom types ----
    const addCustomType: StorageContext['addCustomType'] = useCallback(
        async ({ diagramId, customType }) => {
            await apiFetch(`/diagrams/${diagramId}/custom-types`, {
                method: 'POST',
                body: JSON.stringify(customType),
            });
        },
        []
    );

    const getCustomType: StorageContext['getCustomType'] = useCallback(
        async ({ diagramId, id }) => {
            try {
                return await apiFetch<DBCustomType>(
                    `/diagrams/${diagramId}/custom-types/${id}`
                );
            } catch {
                return undefined;
            }
        },
        []
    );

    const updateCustomType: StorageContext['updateCustomType'] = useCallback(
        async ({ id, attributes }) => {
            await apiFetch(`/custom-types/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(attributes),
            });
        },
        []
    );

    const deleteCustomType: StorageContext['deleteCustomType'] = useCallback(
        async ({ diagramId, id }) => {
            await apiFetch(`/diagrams/${diagramId}/custom-types/${id}`, {
                method: 'DELETE',
            });
        },
        []
    );

    const listCustomTypes: StorageContext['listCustomTypes'] = useCallback(
        async (diagramId) => {
            return await apiFetch<DBCustomType[]>(
                `/diagrams/${diagramId}/custom-types`
            );
        },
        []
    );

    const deleteDiagramCustomTypes: StorageContext['deleteDiagramCustomTypes'] =
        useCallback(async (diagramId) => {
            await apiFetch(`/diagrams/${diagramId}/custom-types`, {
                method: 'DELETE',
            });
        }, []);

    // ---- Notes ----
    const addNote: StorageContext['addNote'] = useCallback(
        async ({ diagramId, note }) => {
            await apiFetch(`/diagrams/${diagramId}/notes`, {
                method: 'POST',
                body: JSON.stringify(note),
            });
        },
        []
    );

    const getNote: StorageContext['getNote'] = useCallback(
        async ({ diagramId, id }) => {
            try {
                return await apiFetch<Note>(
                    `/diagrams/${diagramId}/notes/${id}`
                );
            } catch {
                return undefined;
            }
        },
        []
    );

    const updateNote: StorageContext['updateNote'] = useCallback(
        async ({ id, attributes }) => {
            await apiFetch(`/notes/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(attributes),
            });
        },
        []
    );

    const deleteNote: StorageContext['deleteNote'] = useCallback(
        async ({ diagramId, id }) => {
            await apiFetch(`/diagrams/${diagramId}/notes/${id}`, {
                method: 'DELETE',
            });
        },
        []
    );

    const listNotes: StorageContext['listNotes'] = useCallback(
        async (diagramId) => {
            return await apiFetch<Note[]>(`/diagrams/${diagramId}/notes`);
        },
        []
    );

    const deleteDiagramNotes: StorageContext['deleteDiagramNotes'] =
        useCallback(async (diagramId) => {
            await apiFetch(`/diagrams/${diagramId}/notes`, {
                method: 'DELETE',
            });
        }, []);

    // ---- Diagrams ----
    const addDiagram: StorageContext['addDiagram'] = useCallback(
        async ({ diagram }) => {
            await apiFetch('/diagrams', {
                method: 'POST',
                body: JSON.stringify(diagram),
            });
        },
        []
    );

    const listDiagrams: StorageContext['listDiagrams'] = useCallback(
        async (
            options = {
                includeRelationships: false,
                includeTables: false,
                includeDependencies: false,
                includeAreas: false,
                includeCustomTypes: false,
                includeNotes: false,
            }
        ) => {
            const data = await apiFetch<Diagram[]>(
                `/diagrams${buildQuery(options)}`
            );
            return reviveDates(data);
        },
        []
    );

    const getDiagram: StorageContext['getDiagram'] = useCallback(
        async (
            id,
            options = {
                includeRelationships: false,
                includeTables: false,
                includeDependencies: false,
                includeAreas: false,
                includeCustomTypes: false,
                includeNotes: false,
            }
        ) => {
            try {
                const data = await apiFetch<Diagram>(
                    `/diagrams/${id}${buildQuery(options)}`
                );
                return reviveDates(data);
            } catch {
                return undefined;
            }
        },
        []
    );

    const updateDiagram: StorageContext['updateDiagram'] = useCallback(
        async ({ id, attributes }) => {
            await apiFetch(`/diagrams/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(attributes),
            });
        },
        []
    );

    const deleteDiagram: StorageContext['deleteDiagram'] = useCallback(
        async (id) => {
            await apiFetch(`/diagrams/${id}`, { method: 'DELETE' });
        },
        []
    );

    return (
        <storageContext.Provider
            value={{
                getConfig,
                updateConfig,
                addDiagram,
                listDiagrams,
                getDiagram,
                updateDiagram,
                deleteDiagram,
                addTable,
                getTable,
                updateTable,
                putTable,
                deleteTable,
                listTables,
                addRelationship,
                getRelationship,
                updateRelationship,
                deleteRelationship,
                listRelationships,
                deleteDiagramTables,
                deleteDiagramRelationships,
                addDependency,
                getDependency,
                updateDependency,
                deleteDependency,
                listDependencies,
                deleteDiagramDependencies,
                addArea,
                getArea,
                updateArea,
                deleteArea,
                listAreas,
                deleteDiagramAreas,
                addCustomType,
                getCustomType,
                updateCustomType,
                deleteCustomType,
                listCustomTypes,
                deleteDiagramCustomTypes,
                addNote,
                getNote,
                updateNote,
                deleteNote,
                listNotes,
                deleteDiagramNotes,
                getDiagramFilter,
                updateDiagramFilter,
                deleteDiagramFilter,
            }}
        >
            {children}
        </storageContext.Provider>
    );
};
