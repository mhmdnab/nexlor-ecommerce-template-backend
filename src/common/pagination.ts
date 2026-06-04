import { Paginated, PaginationQueryDto } from './dto/pagination.dto';

/** Convert page/limit into Prisma skip/take. */
export function toSkipTake(query: PaginationQueryDto): { skip: number; take: number } {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  return { skip: (page - 1) * limit, take: limit };
}

/**
 * Resolve a safe orderBy from an allow-list. Prevents arbitrary client-supplied
 * fields from reaching Prisma. Falls back to `fallback`.
 */
export function toOrderBy<T extends string>(
  query: PaginationQueryDto,
  allowed: readonly T[],
  fallback: T,
): Record<string, 'asc' | 'desc'> {
  const field = query.sort && (allowed as readonly string[]).includes(query.sort) ? query.sort : fallback;
  return { [field]: query.order ?? 'desc' };
}

/** Wrap rows + total in the standard envelope. */
export function paginate<T>(data: T[], total: number, query: PaginationQueryDto): Paginated<T> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  return {
    data,
    meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}
