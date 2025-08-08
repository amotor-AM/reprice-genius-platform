import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const adaptDB = new SQLDatabase("adapt", {
  migrations: "./migrations",
});
