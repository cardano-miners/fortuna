import { Prisma } from '@prisma/client';
import type { PageServerLoadEvent } from './$types';

import { dbsync } from '$lib/server/dbsync';

export type BlockData = {
  block_number: number;
  current_hash: string;
  leading_zeros: number;
  target_number: number;
  epoch_time: number;
  current_posix_time: number;
  // only the genesis block has an undefined nonce
  nonce?: string;
};

export async function load({ url }: PageServerLoadEvent) {
  const pageNumber = url.searchParams.get('page') ?? '1';

  let parsedPageNumber = parseInt(pageNumber);
  const parsedPageLimit = 10;

  if (isNaN(parsedPageNumber) || parsedPageNumber < 1) {
    parsedPageNumber = 1;
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
    orderBy: { id: 'desc' },
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

  const blocks: BlockData[] = data.map((maTxOut) => ({
    // @ts-expect-error PlutusData is typed weird
    block_number: maTxOut.tx_out.datum!.value.fields[0].int as number,
    // @ts-expect-error PlutusData is typed weird
    current_hash: maTxOut.tx_out.datum!.value.fields[1].bytes as string,
    // @ts-expect-error PlutusData is typed weird
    leading_zeros: maTxOut.tx_out.datum!.value.fields[2].int as number,
    // @ts-expect-error PlutusData is typed weird
    target_number: maTxOut.tx_out.datum!.value.fields[3].int as number,
    // @ts-expect-error PlutusData is typed weird
    epoch_time: maTxOut.tx_out.datum!.value.fields[4].int as number,
    // @ts-expect-error PlutusData is typed weird
    current_posix_time: maTxOut.tx_out.datum!.value.fields[5].int as number,

    // @ts-expect-error PlutusData is typed weird
    nonce: maTxOut.tx_out.tx.redeemers[0]?.redeemer_data?.value?.fields[0].bytes as
      | string
      | undefined,
  }));

  return { blocks, canNextPage, canPrevPage, totalPages };
}
