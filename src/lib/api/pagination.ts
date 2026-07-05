// Imported from the OpenAPI-extended re-export (not `'zod'` directly):
// `paginatedResponseSchema` below builds schemas the registry (story 1.5)
// registers, which requires `extendZodWithOpenApi` to have already run —
// see `src/lib/schemas/zod-with-openapi.ts` for why the import source
// matters here.
import { z } from '@/lib/schemas/zod-with-openapi';

/**
 * Standard pagination query (AD-8: list endpoints accept `page`/`pageSize`).
 * Defaults 1/20, capped at 100 — a single source of truth every paginated
 * `/api/v1/*` endpoint reuses instead of redefining the same three lines
 * (Consistency Conventions: "Uno schema Zod ... unica fonte").
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** AD-8's standard paginated list shape. */
export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

/** Builds the AD-8 paginated envelope from a page of items, the grand total, and the query that produced them. */
export function paginate<T>(items: T[], total: number, query: PaginationQuery): PaginatedResult<T> {
  return { items, total, page: query.page, pageSize: query.pageSize };
}

/** `skip`/`take` for a Prisma `findMany`, derived from a validated pagination query. */
export function paginationOffset(query: PaginationQuery): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

/**
 * Builds the OpenAPI/documentation counterpart of {@link paginate}'s output
 * shape for a given item schema — used by the registry (story 1.5) so a
 * paginated endpoint's response schema is one line, not a hand-written
 * `{ items, total, page, pageSize }` object repeated per domain.
 */
export function paginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
  });
}
