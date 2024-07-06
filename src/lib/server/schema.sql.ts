import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const blocks = sqliteTable('blocks', {
  number: integer('number').notNull().primaryKey(),
  hash: text('hash', { length: 64 }).notNull().unique(),
  leading_zeros: integer('leading_zeros').notNull(),
  target_number: integer('target_number').notNull(),
  epoch_time: integer('epoch_time').notNull(),
  current_posix_time: integer('current_posix_time').notNull(),
  // only the genesis block has an undefined nonce
  nonce: text('nonce', { length: 32 }),
});
