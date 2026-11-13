import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/** Pagination par curseur (identifiant du dernier élément reçu). */
export class CursorPaginationQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;

  @ApiPropertyOptional({ format: 'uuid', description: 'Valeur `nextCursor` de la page précédente.' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Arguments Prisma pour lire `limit + 1` éléments à partir du curseur. */
export function cursorArgs(query: CursorPaginationQuery): {
  take: number;
  skip?: number;
  cursor?: { id: string };
} {
  return {
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  };
}

export function toPage<T extends { id: string }>(rows: T[], limit: number): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}
