import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const ebayDB = new SQLDatabase("ebay", {
  migrations: "./migrations",
});
