import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const brainDB = new SQLDatabase("brain", {
  migrations: "./migrations",
});
