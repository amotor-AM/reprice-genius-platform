import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const marketplaceDB = new SQLDatabase("marketplace", {
  migrations: "./migrations",
});
