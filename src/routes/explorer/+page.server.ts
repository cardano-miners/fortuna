import pg from 'pg';

import { DATABASE_URL } from '$env/static/private';

import type { PageServerLoadEvent } from './$types';

import type { BlockData } from '$lib/types';

export async function load({ url }: PageServerLoadEvent) {
  const dbsync = new pg.Client(DATABASE_URL);
  await dbsync.connect();

  const pageNumber = url.searchParams.get('page') ?? '1';

  let parsedPageNumber = parseInt(pageNumber);
  const parsedPageLimit = 15;

  if (isNaN(parsedPageNumber) || parsedPageNumber < 1) {
    parsedPageNumber = 1;
  }

  const data = await dbsync.query(
    `
    SELECT
      "ma_tx_out_tx_out"."__data__" AS "tx_out"
    FROM
      "public"."ma_tx_out" AS "t1"
      LEFT JOIN "public"."multi_asset" AS "j1" ON ("j1"."id") = ("t1"."ident")
      LEFT JOIN LATERAL (
        SELECT
          JSONB_BUILD_OBJECT(
            'datum', "tx_out_datum"."__data__",
            'tx', "tx_out_tx"."__data__"
          ) AS "__data__"
        FROM
          "public"."tx_out" AS "t2"
          LEFT JOIN LATERAL (
            SELECT
              JSONB_BUILD_OBJECT(
                'value', "t3"."value"
              ) AS "__data__"
            FROM
              "public"."datum" AS "t3"
            WHERE
              "t2"."inline_datum_id" = "t3"."id"
            LIMIT
              1
          ) AS "tx_out_datum" ON true
          LEFT JOIN LATERAL (
            SELECT
              JSONB_BUILD_OBJECT(
                'redeemers', "tx_redeemers"."__data__"
              ) AS "__data__"
            FROM
              "public"."tx" AS "t4"
              LEFT JOIN LATERAL (
                SELECT
                  COALESCE(
                    JSONB_AGG("__data__"),
                    '[]'
                  ) AS "__data__"
                FROM
                  (
                    SELECT
                      "t7"."__data__"
                    FROM
                      (
                        SELECT
                          JSONB_BUILD_OBJECT(
                            'redeemer_data', "redeemer_redeemer_data"."__data__"
                          ) AS "__data__",
                          "t6"."purpose",
                          "t6"."script_hash",
                          "t6"."redeemer_data_id"
                        FROM
                          (
                            SELECT
                              "t5".*
                            FROM
                              "public"."redeemer" AS "t5"
                            WHERE
                              "t4"."id" = "t5"."tx_id"
                              ) AS "t6"
                          LEFT JOIN LATERAL (
                            SELECT
                              JSONB_BUILD_OBJECT(
                                'value', "t9"."value"
                              ) AS "__data__"
                            FROM
                              "public"."redeemer_data" AS "t9"
                            WHERE
                              "t6"."redeemer_data_id" = "t9"."id"
                            LIMIT
                              1
                          ) AS "redeemer_redeemer_data" ON true
                          ) AS "t7"
                    WHERE
                      (
                        "t7"."purpose" = CAST(
                          $5 :: text AS "public"."scriptpurposetype"
                        )
                        AND "t7"."script_hash" = decode($1, 'hex')
                      )
                      ) AS "t8"
                  ) AS "tx_redeemers" ON true
            WHERE
              "t2"."tx_id" = "t4"."id"
            LIMIT
              1
          ) AS "tx_out_tx" ON true
        WHERE
          "t1"."tx_out_id" = "t2"."id"
        LIMIT
          1
      ) AS "ma_tx_out_tx_out" ON true
    WHERE
      (
        "j1"."policy" = decode($1, 'hex')
        AND "j1"."name" = $2
        AND ("j1"."id" IS NOT NULL)
      )
    ORDER BY
      "t1"."id" DESC
    LIMIT
      $3 OFFSET $4
    `,
    [
      `279f842c33eed9054b9e3c70cd6a3b32298259c24b78b895cb41d91a`,
      Buffer.from('lord tuna').toString(),
      parsedPageLimit.toString(),
      ((parsedPageNumber - 1) * parsedPageLimit).toString(),
      'spend',
    ],
  );

  const count = await dbsync.query(
    `
    SELECT COUNT(*)
    FROM "public"."ma_tx_out" AS "t1"
    LEFT JOIN "public"."multi_asset" AS "j1" ON ("j1"."id") = ("t1"."ident")
    WHERE
      (
        "j1"."policy" = decode($1, 'hex')
        AND "j1"."name" = $2
        AND ("j1"."id" IS NOT NULL)
      )`,
    [
      `279f842c33eed9054b9e3c70cd6a3b32298259c24b78b895cb41d91a`,
      Buffer.from('lord tuna').toString(),
    ],
  );

  const totalCount = count.rows[0].count;

  const canNextPage = totalCount > parsedPageLimit * parsedPageNumber;
  const canPrevPage = parsedPageNumber > 1;
  const totalPages = Math.ceil(totalCount / parsedPageLimit);

  const blocks: BlockData[] = data.rows.map((maTxOut) => ({
    block_number: maTxOut.tx_out.datum!.value.fields[0].int as number,
    current_hash: maTxOut.tx_out.datum!.value.fields[1].bytes as string,
    leading_zeros: maTxOut.tx_out.datum!.value.fields[2].int as number,
    target_number: maTxOut.tx_out.datum!.value.fields[3].int as number,
    epoch_time: maTxOut.tx_out.datum!.value.fields[4].int as number,
    current_posix_time: maTxOut.tx_out.datum!.value.fields[5].int as number,
    nonce: maTxOut.tx_out.tx.redeemers[0]?.redeemer_data?.value?.fields[0].bytes as
      | string
      | undefined,
  }));

  return { blocks, canNextPage, canPrevPage, totalPages, totalCount };
}
