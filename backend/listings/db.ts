import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const listingsDB = new SQLDatabase("listings", {
  migrations: "./migrations",
});
