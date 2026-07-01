import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch, ApiError, getClientId } from '@/lib/api/client';
import { lockContext, type LockState } from './lock-context';

const HEARTBEAT_INTERVAL_MS = 10_000;
// While read-only, keep polling so the diagram unlocks automatically as soon as
// the other session releases the lock or its lock expires (see LOCK_TTL_MS on
// the server) — without the user having to click "retry".
const READONLY_RETRY_INTERVAL_MS = 5_000;

interface AcquireResponse {
    ok: boolean;
    clientId?: string;
    acquiredAt?: number;
    ttlMs?: number;
    heldBy?: string;
    expiresAt?: number;
}

export const LockProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const { diagramId } = useParams<{ diagramId: string }>();
    const [state, setState] = useState<LockState>({ status: 'idle' });
    const [retryCounter, setRetryCounter] = useState(0);
    const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopHeartbeat = useCallback(() => {
        if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current);
            heartbeatRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!diagramId) {
            setState({ status: 'idle' });
            return;
        }

        let cancelled = false;
        setState({ status: 'acquiring' });

        const acquire = async () => {
            try {
                const res = await apiFetch<AcquireResponse>(
                    `/diagrams/${diagramId}/lock`,
                    { method: 'POST' }
                );
                if (cancelled) return;
                if (res.ok) {
                    setState({
                        status: 'held',
                        acquiredAt: res.acquiredAt ?? Date.now(),
                        ttlMs: res.ttlMs ?? 30_000,
                    });
                }
            } catch (err) {
                if (cancelled) return;
                if (err instanceof ApiError && err.status === 409) {
                    const body = err.body as AcquireResponse | null;
                    setState({
                        status: 'readonly',
                        heldBy: body?.heldBy ?? 'unknown',
                        expiresAt: body?.expiresAt ?? Date.now(),
                    });
                } else {
                    // Unknown error; treat as read-only to be safe.
                    setState({
                        status: 'readonly',
                        heldBy: 'unknown',
                        expiresAt: Date.now(),
                    });
                }
            }
        };

        acquire();

        return () => {
            cancelled = true;
        };
    }, [diagramId, retryCounter]);

    useEffect(() => {
        if (!diagramId || state.status !== 'held') {
            stopHeartbeat();
            return;
        }
        heartbeatRef.current = setInterval(() => {
            apiFetch(`/diagrams/${diagramId}/lock/heartbeat`, {
                method: 'POST',
            }).catch((err) => {
                if (err instanceof ApiError && err.status === 409) {
                    const body = err.body as AcquireResponse | null;
                    setState({
                        status: 'readonly',
                        heldBy: body?.heldBy ?? 'unknown',
                        expiresAt: body?.expiresAt ?? Date.now(),
                    });
                }
            });
        }, HEARTBEAT_INTERVAL_MS);
        return () => stopHeartbeat();
    }, [diagramId, state.status, stopHeartbeat]);

    // Auto-retry while read-only so we reclaim the lock the moment it frees up.
    useEffect(() => {
        if (!diagramId || state.status !== 'readonly') return;
        const interval = setInterval(() => {
            setRetryCounter((n) => n + 1);
        }, READONLY_RETRY_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [diagramId, state.status]);

    useEffect(() => {
        if (!diagramId) return;
        const release = () => {
            // Primary path: sendBeacon (POST) to the beacon-friendly release
            // endpoint. sendBeacon can't set headers, so the client id travels
            // in the body. This is the reliable way to drop the lock on tab
            // close, so the diagram doesn't stay stuck as "read-only" elsewhere.
            const beaconUrl = `/api/diagrams/${diagramId}/lock/release`;
            const payload = JSON.stringify({ clientId: getClientId() });
            const sent = navigator.sendBeacon?.(
                beaconUrl,
                new Blob([payload], { type: 'application/json' })
            );
            // Fallback for browsers where sendBeacon is unavailable/failed.
            if (!sent) {
                try {
                    apiFetch(`/diagrams/${diagramId}/lock`, {
                        method: 'DELETE',
                        keepalive: true,
                    }).catch(() => {});
                } catch {
                    /* ignore */
                }
            }
        };
        window.addEventListener('beforeunload', release);
        return () => {
            window.removeEventListener('beforeunload', release);
            release();
        };
    }, [diagramId]);

    const retry = useCallback(() => {
        setRetryCounter((n) => n + 1);
    }, []);

    return (
        <lockContext.Provider
            value={{
                state,
                isReadOnly: state.status === 'readonly',
                retry,
            }}
        >
            {children}
        </lockContext.Provider>
    );
};
