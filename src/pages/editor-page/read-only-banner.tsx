import React from 'react';
import { useLock } from '@/hooks/use-lock';

export const ReadOnlyBanner: React.FC = () => {
    const { state, retry } = useLock();
    if (state.status !== 'readonly') return null;

    return (
        <div className="flex items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
            <span>
                Read-only — dit diagram is open in een andere sessie
                {state.heldBy ? ` (${state.heldBy.slice(0, 8)})` : ''}.
            </span>
            <button
                onClick={retry}
                className="rounded border border-amber-700/40 px-2 py-0.5 text-xs hover:bg-amber-200/60 dark:hover:bg-amber-800/40"
            >
                Opnieuw proberen
            </button>
        </div>
    );
};
