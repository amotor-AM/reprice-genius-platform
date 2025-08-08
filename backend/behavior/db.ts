import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const behaviorDB = new SQLDatabase("behavior", {
  migrations: "./migrations",
});
