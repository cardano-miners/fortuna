import { Prisma } from '@prisma/client';
import { PageServerLoadEvent } from './$types';

import { dbsync } from '$lib/server/dbsync';

export async function load({ url }: PageServerLoadEvent) {
  const pageNumber = url.searchParams.get('page') ?? '1';
  const pageLimit = url.searchParams.get('pageSize') ?? '10';

  let parsedPageNumber = parseInt(pageNumber);
  let parsedPageLimit = parseInt(pageLimit);

  if (isNaN(parsedPageNumber)) {
    parsedPageNumber = 1;
  }

  if (isNaN(parsedPageLimit)) {
    parsedPageLimit = 10;
  }

  const policy = Buffer.from([
    0x27, 0x9f, 0x84, 0x2c, 0x33, 0xee, 0xd9, 0x05, 0x4b, 0x9e, 0x3c, 0x70, 0xcd, 0x6a, 0x3b, 0x32,
    0x29, 0x82, 0x59, 0xc2, 0x4b, 0x78, 0xb8, 0x95, 0xcb, 0x41, 0xd9, 0x1a,
  ]);

  // filters tx outs that contain the master token
  const where: Prisma.ma_tx_outWhereInput = {
    multi_asset: {
      policy,
      name: Buffer.from('lord tuna'),
    },
  };

  const data = await dbsync.ma_tx_out.findMany({
    relationLoadStrategy: 'join',
    skip: (parsedPageNumber - 1) * parsedPageLimit,
    take: parsedPageLimit,
    where,
    include: {
      tx_out: {
        include: {
          datum: true,
          tx: {
            include: {
              redeemers: {
                include: { redeemer_data: true },
                where: { purpose: 'spend', script_hash: policy },
              },
            },
          },
        },
      },
    },
  });

  const totalCount = await dbsync.ma_tx_out.count({ where });

  const canNextPage = totalCount > parsedPageLimit * parsedPageNumber;
  const canPrevPage = parsedPageNumber > 1;
  const totalPages = Math.ceil(totalCount / parsedPageLimit);

  const blocks = data.map((maTxOut) => ({
    state: maTxOut.tx_out.datum!.value,
    redeemer: maTxOut.tx_out.tx.redeemers[0]?.redeemer_data.value,
  }));

  return { blocks, canNextPage, canPrevPage, totalPages };
}
