import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const blocks = sqliteTable('blocks', {
  number: integer('number').notNull().primaryKey(),
  hash: text('hash', { length: 64 }).notNull().unique(),
  leadingZeros: integer('leading_zeros').notNull(),
  targetNumber: integer('target_number').notNull(),
  epochTime: integer('epoch_time').notNull(),
  currentPosixTime: integer('current_posix_time').notNull(),
  // only the genesis block has an undefined nonce
  nonce: text('nonce', { length: 32 }),
});
