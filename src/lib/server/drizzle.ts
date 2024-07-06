import { drizzle as wrapper } from 'drizzle-orm/d1';

import * as schema from './schema.sql';

export function drizzle(d1: D1Database) {
  return wrapper(d1, { schema });
}
