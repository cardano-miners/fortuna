import { count } from 'drizzle-orm';

import type { PageServerLoadEvent } from './$types';

import { drizzle } from '$lib/server/drizzle';
import * as schema from '$lib/server/schema.sql';

export async function load({ url, platform }: PageServerLoadEvent) {
  const db = drizzle(platform!.env.DB);

  const pageNumber = url.searchParams.get('page') ?? '1';

  let parsedPageNumber = parseInt(pageNumber);
  const parsedPageLimit = 15;

  if (isNaN(parsedPageNumber) || parsedPageNumber < 1) {
    parsedPageNumber = 1;
  }

  const blocks = await db.query.blocks.findMany({
    orderBy(fields, { desc }) {
      return [desc(fields.number)];
    },
    limit: parsedPageLimit,
    offset: (parsedPageNumber - 1) * parsedPageLimit,
  });

  const result = await db.select({ count: count(schema.blocks.number) }).from(schema.blocks);

  const totalCount = result[0].count;

  const canNextPage = totalCount > parsedPageLimit * parsedPageNumber;
  const canPrevPage = parsedPageNumber > 1;
  const totalPages = Math.ceil(totalCount / parsedPageLimit);

  return { blocks, canNextPage, canPrevPage, totalPages, totalCount };
}
