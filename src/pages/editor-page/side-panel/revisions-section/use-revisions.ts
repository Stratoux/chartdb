import { useCallback, useEffect, useState } from 'react';
import { useChartDB } from '@/hooks/use-chartdb';
import { useStorage } from '@/hooks/use-storage';
import type { DiagramRevision } from '@/lib/domain/diagram-revision';

// Loads and mutates the server-side revisions for the current diagram.
// Snapshots are created from the current in-memory diagram, and
// previewed/restored by loading them back in-memory.
export const useRevisions = () => {
    const { diagramId } = useChartDB();
    const {
        listRevisions,
        getRevision,
        saveRevision,
        renameRevision,
        deleteRevision,
    } = useStorage();

    const [revisions, setRevisions] = useState<DiagramRevision[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const refresh = useCallback(async () => {
        if (!diagramId) {
            setRevisions([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            setRevisions(await listRevisions(diagramId));
        } finally {
            setIsLoading(false);
        }
    }, [diagramId, listRevisions]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return {
        diagramId,
        revisions,
        isLoading,
        refresh,
        getRevision,
        saveRevision,
        renameRevision,
        deleteRevision,
    };
};
