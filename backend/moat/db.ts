import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const moatDB = new SQLDatabase("moat", {
  migrations: "./migrations",
});
