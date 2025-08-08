import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const graphDB = new SQLDatabase("graph", {
  migrations: "./migrations",
});
