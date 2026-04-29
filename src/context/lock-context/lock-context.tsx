import { createContext } from 'react';

export type LockState =
    | { status: 'idle' }
    | { status: 'acquiring' }
    | { status: 'held'; acquiredAt: number; ttlMs: number }
    | { status: 'readonly'; heldBy: string; expiresAt: number };

export interface LockContextValue {
    state: LockState;
    isReadOnly: boolean;
    retry: () => void;
}

export const lockInitialValue: LockContextValue = {
    state: { status: 'idle' },
    isReadOnly: false,
    retry: () => {},
};

export const lockContext = createContext<LockContextValue>(lockInitialValue);
