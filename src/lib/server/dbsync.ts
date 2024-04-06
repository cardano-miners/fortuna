import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg-worker';
import { Pool } from '@prisma/pg-worker';

import { DATABASE_URL } from '$env/static/private';

const pool = new Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);

export const dbsync = new PrismaClient({ adapter });
