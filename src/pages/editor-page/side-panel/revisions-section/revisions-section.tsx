import React, { useCallback, useMemo, useState } from 'react';
import {
    Check,
    GitCompareArrows,
    History,
    Pencil,
    Save,
    Trash2,
    Undo2,
    X,
} from 'lucide-react';
import { useChartDB } from '@/hooks/use-chartdb';
import { useDiff } from '@/context/diff-context/use-diff';
import { useToast } from '@/components/toast/use-toast';
import { useFullScreenLoader } from '@/hooks/use-full-screen-spinner';
import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';
import { Spinner } from '@/components/spinner/spinner';
import { useRevisions } from './use-revisions';
import type { DiagramRevision } from '@/lib/domain/diagram-revision';

export interface RevisionsSectionProps {}

const formatDate = (date: Date) =>
    new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);

export const RevisionsSection: React.FC<RevisionsSectionProps> = () => {
    const { currentDiagram, updateDiagramData, loadDiagramFromData, readonly } =
        useChartDB();
    const { calculateDiff, resetDiff } = useDiff();
    const { toast } = useToast();
    const { showLoader, hideLoader } = useFullScreenLoader();
    const {
        diagramId,
        revisions,
        isLoading,
        refresh,
        getRevision,
        saveRevision,
        renameRevision,
        deleteRevision,
    } = useRevisions();

    const [newName, setNewName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    // Revision currently loaded read-only into the canvas (preview mode).
    const [previewingId, setPreviewingId] = useState<string | null>(null);

    const sorted = useMemo(
        () =>
            [...revisions].sort(
                (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
            ),
        [revisions]
    );

    const handleSave = useCallback(async () => {
        const name = newName.trim();
        if (!name || !diagramId) return;
        setIsSaving(true);
        try {
            await saveRevision({ diagramId, name, diagram: currentDiagram });
            setNewName('');
            await refresh();
            toast({ title: 'Revision saved', description: `"${name}" saved.` });
        } catch {
            toast({
                title: 'Could not save revision',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    }, [newName, diagramId, saveRevision, currentDiagram, refresh, toast]);

    const withRevisionDiagram = useCallback(
        async (revision: DiagramRevision) => {
            if (!diagramId) return undefined;
            const full = await getRevision({ diagramId, id: revision.id });
            return full?.diagram;
        },
        [diagramId, getRevision]
    );

    const handleRestore = useCallback(
        async (revision: DiagramRevision) => {
            showLoader();
            try {
                const diagram = await withRevisionDiagram(revision);
                if (!diagram) throw new Error('missing');
                resetDiff();
                setPreviewingId(null);
                await updateDiagramData(diagram, { forceUpdateStorage: true });
                toast({
                    title: 'Revision restored',
                    description: `Diagram restored to "${revision.name}".`,
                });
            } catch {
                toast({
                    title: 'Could not restore revision',
                    variant: 'destructive',
                });
            } finally {
                hideLoader();
            }
        },
        [
            withRevisionDiagram,
            resetDiff,
            updateDiagramData,
            toast,
            showLoader,
            hideLoader,
        ]
    );

    const handlePreview = useCallback(
        async (revision: DiagramRevision) => {
            const diagram = await withRevisionDiagram(revision);
            if (!diagram) {
                toast({
                    title: 'Could not open revision',
                    variant: 'destructive',
                });
                return;
            }
            resetDiff();
            loadDiagramFromData(diagram);
            setPreviewingId(revision.id);
        },
        [withRevisionDiagram, resetDiff, loadDiagramFromData, toast]
    );

    const handleExitPreview = useCallback(() => {
        // Reload the real (persisted) diagram to leave preview.
        loadDiagramFromData(currentDiagram);
        resetDiff();
        setPreviewingId(null);
    }, [currentDiagram, loadDiagramFromData, resetDiff]);

    const handleCompare = useCallback(
        async (revision: DiagramRevision) => {
            const diagram = await withRevisionDiagram(revision);
            if (!diagram) {
                toast({
                    title: 'Could not compare revision',
                    variant: 'destructive',
                });
                return;
            }
            // Show what changed between this revision and the current diagram,
            // rendered as a diff overlay on the canvas.
            resetDiff();
            calculateDiff({
                diagram,
                newDiagram: currentDiagram,
                options: { summaryOnly: false },
            });
            setPreviewingId(null);
        },
        [withRevisionDiagram, resetDiff, calculateDiff, currentDiagram, toast]
    );

    const handleRename = useCallback(
        async (revision: DiagramRevision) => {
            const name = renameValue.trim();
            if (!name || !diagramId) {
                setRenamingId(null);
                return;
            }
            try {
                await renameRevision({ diagramId, id: revision.id, name });
                await refresh();
            } catch {
                toast({
                    title: 'Could not rename revision',
                    variant: 'destructive',
                });
            } finally {
                setRenamingId(null);
            }
        },
        [renameValue, diagramId, renameRevision, refresh, toast]
    );

    const handleDelete = useCallback(
        async (revision: DiagramRevision) => {
            if (!diagramId) return;
            try {
                await deleteRevision({ diagramId, id: revision.id });
                if (previewingId === revision.id) handleExitPreview();
                await refresh();
            } catch {
                toast({
                    title: 'Could not delete revision',
                    variant: 'destructive',
                });
            } finally {
                setConfirmDeleteId(null);
            }
        },
        [
            diagramId,
            deleteRevision,
            refresh,
            toast,
            previewingId,
            handleExitPreview,
        ]
    );

    return (
        <section
            className="flex flex-1 flex-col overflow-hidden px-2"
            data-vaul-no-drag
        >
            {!readonly ? (
                <div className="flex items-center gap-1 py-2">
                    <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleSave();
                        }}
                        placeholder="Revision name…"
                        className="h-8"
                        disabled={isSaving || !!previewingId}
                    />
                    <Button
                        size="sm"
                        variant="default"
                        className="h-8 shrink-0 gap-1"
                        onClick={() => void handleSave()}
                        disabled={!newName.trim() || isSaving || !!previewingId}
                    >
                        {isSaving ? (
                            <Spinner size="small" />
                        ) : (
                            <Save className="size-4" />
                        )}
                        Save
                    </Button>
                </div>
            ) : null}

            {previewingId ? (
                <div className="mb-2 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                    <span>Previewing a revision (read-only).</span>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 gap-1 px-1.5"
                        onClick={handleExitPreview}
                    >
                        <X className="size-3.5" />
                        Exit
                    </Button>
                </div>
            ) : null}

            <div className="flex flex-1 flex-col gap-1 overflow-y-auto pb-2">
                {isLoading ? (
                    <div className="flex flex-1 items-center justify-center">
                        <Spinner />
                    </div>
                ) : sorted.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                        <History className="size-8 opacity-40" />
                        <p>No revisions yet.</p>
                        {!readonly ? (
                            <p className="text-xs">
                                Save a named snapshot of the current diagram to
                                start a history.
                            </p>
                        ) : null}
                    </div>
                ) : (
                    sorted.map((revision) => (
                        <div
                            key={revision.id}
                            className="group flex flex-col gap-1 rounded-md border border-border p-2"
                        >
                            {renamingId === revision.id ? (
                                <div className="flex items-center gap-1">
                                    <Input
                                        autoFocus
                                        value={renameValue}
                                        onChange={(e) =>
                                            setRenameValue(e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter')
                                                void handleRename(revision);
                                            if (e.key === 'Escape')
                                                setRenamingId(null);
                                        }}
                                        className="h-7"
                                    />
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="size-7 shrink-0 p-0"
                                        onClick={() =>
                                            void handleRename(revision)
                                        }
                                    >
                                        <Check className="size-4 text-green-600" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="size-7 shrink-0 p-0"
                                        onClick={() => setRenamingId(null)}
                                    >
                                        <X className="size-4" />
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">
                                            {revision.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDate(revision.createdAt)}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {confirmDeleteId === revision.id ? (
                                <div className="flex items-center justify-between gap-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
                                    <span>Delete this revision?</span>
                                    <div className="flex gap-1">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 px-2 text-red-600"
                                            onClick={() =>
                                                void handleDelete(revision)
                                            }
                                        >
                                            Delete
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 px-2"
                                            onClick={() =>
                                                setConfirmDeleteId(null)
                                            }
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            ) : renamingId !== revision.id ? (
                                <div className="flex flex-wrap items-center gap-1">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 gap-1 px-2 text-xs"
                                        onClick={() =>
                                            void handlePreview(revision)
                                        }
                                    >
                                        <History className="size-3.5" />
                                        Preview
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 gap-1 px-2 text-xs"
                                        onClick={() =>
                                            void handleCompare(revision)
                                        }
                                    >
                                        <GitCompareArrows className="size-3.5" />
                                        Compare
                                    </Button>
                                    {!readonly ? (
                                        <>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 gap-1 px-2 text-xs"
                                                onClick={() =>
                                                    void handleRestore(revision)
                                                }
                                            >
                                                <Undo2 className="size-3.5" />
                                                Restore
                                            </Button>
                                            <div className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="size-7 p-0"
                                                    onClick={() => {
                                                        setRenameValue(
                                                            revision.name
                                                        );
                                                        setRenamingId(
                                                            revision.id
                                                        );
                                                    }}
                                                >
                                                    <Pencil className="size-3.5" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="size-7 p-0 text-red-500"
                                                    onClick={() =>
                                                        setConfirmDeleteId(
                                                            revision.id
                                                        )
                                                    }
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </Button>
                                            </div>
                                        </>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    ))
                )}
            </div>
        </section>
    );
};
