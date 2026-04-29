import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch, ApiError } from '@/lib/api/client';
import { lockContext, type LockState } from './lock-context';

const HEARTBEAT_INTERVAL_MS = 10_000;

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

    useEffect(() => {
        if (!diagramId) return;
        const release = () => {
            // sendBeacon for reliable release on tab close.
            const url = `/api/diagrams/${diagramId}/lock`;
            navigator.sendBeacon?.(url + '?_method=DELETE');
            // Best-effort fetch as well (sendBeacon doesn't support DELETE directly,
            // so we rely on the server treating expired locks as releasable, plus a
            // direct DELETE that may complete on tab close in some browsers).
            try {
                apiFetch(`/diagrams/${diagramId}/lock`, {
                    method: 'DELETE',
                    keepalive: true,
                }).catch(() => {});
            } catch {
                /* ignore */
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
