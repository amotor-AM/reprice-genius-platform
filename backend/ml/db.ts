import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const mlDB = new SQLDatabase("ml", {
  migrations: "./migrations",
});
