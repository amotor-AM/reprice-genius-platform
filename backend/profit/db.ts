import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const profitDB = new SQLDatabase("profit", {
  migrations: "./migrations",
});
