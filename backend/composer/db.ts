import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const composerDB = new SQLDatabase("composer", {
  migrations: "./migrations",
});
