import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const intelDB = new SQLDatabase("intel", {
  migrations: "./migrations",
});
