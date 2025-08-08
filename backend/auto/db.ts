import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const autoDB = new SQLDatabase("auto", {
  migrations: "./migrations",
});
