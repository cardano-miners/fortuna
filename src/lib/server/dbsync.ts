import { PrismaClient } from '@prisma/client';

import { NODE_ENV } from '$env/static/private';

let dbsync: PrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var __dbsync: PrismaClient | undefined;
}

// this is needed because in development we don't want to restart
// the server with every change, but we want to make sure we don't
// create a new connection to the DB with every change either.
if (NODE_ENV === 'production') {
  dbsync = new PrismaClient();
} else {
  if (!global.__dbsync) {
    global.__dbsync = new PrismaClient({ log: ['query'] });
  }

  dbsync = global.__dbsync;
}

export { dbsync };
