import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const strategyDB = new SQLDatabase("strategy", {
  migrations: "./migrations",
});
