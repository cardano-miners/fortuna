import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const blocks = sqliteTable('blocks', {
  number: integer('number').notNull().primaryKey(),
  hash: text('hash', { length: 64 }).notNull().unique(),
  leadingZeros: integer('leading_zeros').notNull(),
  targetNumber: integer('target_number').notNull(),
  epochTime: integer('epoch_time').notNull(),
  currentPosixTime: integer('current_posix_time').notNull(),
  // only the genesis block has an undefined nonce
  nonce: text('nonce', { length: 64 }),
  // payment key of 28 bytes
  // NFT max of 60 bytes
  paymentCred: text('miner_cred'),
  nftCred: text('nft_cred', { length: 120 }),
  data: text('data'),
  cardano_tx_hash: text('cardano_tx_hash', { length: 64 }).notNull().unique(),
  cardano_slot: integer('cardano_slot').notNull(),
  cardano_hash: text('cardano_hash', { length: 64 }).notNull(),
});
