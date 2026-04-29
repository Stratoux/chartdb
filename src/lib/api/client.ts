import { nanoid } from 'nanoid';
import { toast } from '@/components/toast/use-toast';

const API_BASE = '/api';

let clientIdCache: string | null = null;
export function getClientId(): string {
    if (clientIdCache) return clientIdCache;
    const stored = localStorage.getItem('chartdb_client_id');
    if (stored) {
        clientIdCache = stored;
        return stored;
    }
    const id = nanoid();
    localStorage.setItem('chartdb_client_id', id);
    clientIdCache = id;
    return id;
}

export class ApiError extends Error {
    status: number;
    code?: string;
    body?: unknown;
    constructor(status: number, message: string, body?: unknown) {
        super(message);
        this.status = status;
        this.body = body;
        if (
            body &&
            typeof body === 'object' &&
            'code' in body &&
            typeof (body as { code: unknown }).code === 'string'
        ) {
            this.code = (body as { code: string }).code;
        }
    }
}

export async function apiFetch<T = unknown>(
    path: string,
    init: RequestInit = {}
): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('X-Client-Id', getClientId());
    if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    const res = await fetch(API_BASE + path, { ...init, headers });
    const text = await res.text();
    const data = text ? safeParse(text) : null;
    if (!res.ok) {
        const message =
            (data && typeof data === 'object' && 'error' in data
                ? String((data as { error: unknown }).error)
                : null) || `${res.status} ${res.statusText}`;
        const error = new ApiError(res.status, message, data);
        maybeNotifyLockConflict(error, path, init.method);
        throw error;
    }
    return data as T;
}

let lastLockToastAt = 0;
function maybeNotifyLockConflict(err: ApiError, path: string, method?: string) {
    if (err.status !== 409) return;
    if (path.includes('/lock')) return;
    if (!method || method.toUpperCase() === 'GET') return;
    const now = Date.now();
    if (now - lastLockToastAt < 3000) return;
    lastLockToastAt = now;
    toast({
        title: 'Wijziging geblokkeerd',
        description:
            err.code === 'LOCKED_BY_OTHER'
                ? 'Iemand anders heeft dit diagram open. Je sessie is read-only.'
                : 'Lock verlopen. Herlaad de pagina om door te gaan.',
        variant: 'destructive',
    });
}

function safeParse(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

export function buildQuery(
    params: Record<string, boolean | undefined>
): string {
    const entries = Object.entries(params).filter(([, v]) => v);
    if (entries.length === 0) return '';
    const qs = new URLSearchParams();
    for (const [k, v] of entries) qs.set(k, String(v));
    return `?${qs.toString()}`;
}

export function reviveDates<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) {
        return obj.map((v) => reviveDates(v)) as unknown as T;
    }
    if (typeof obj === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            if (
                (k === 'createdAt' || k === 'updatedAt') &&
                typeof v === 'string'
            ) {
                out[k] = new Date(v);
            } else {
                out[k] = reviveDates(v);
            }
        }
        return out as T;
    }
    return obj;
}
