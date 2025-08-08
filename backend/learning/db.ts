import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const learningDB = new SQLDatabase("learning", {
  migrations: "./migrations",
});
