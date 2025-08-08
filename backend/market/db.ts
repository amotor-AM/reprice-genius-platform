import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const marketDB = new SQLDatabase("market", {
  migrations: "./migrations",
});
