import { z } from 'zod';
import type { Diagram } from './diagram';
import { diagramSchema } from './diagram';

// A named, full-diagram snapshot ("revision"). Stored server-side only.
// The `diagram` snapshot is present when a single revision is fetched, but
// omitted from list responses (which return metadata only).
export interface DiagramRevision {
    id: string;
    diagramId: string;
    name: string;
    createdAt: Date;
    diagram?: Diagram;
}

export const diagramRevisionSchema: z.ZodType<DiagramRevision> = z.object({
    id: z.string(),
    diagramId: z.string(),
    name: z.string(),
    createdAt: z.date(),
    diagram: diagramSchema.optional(),
});
