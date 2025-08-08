import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const documentsDB = new SQLDatabase("documents", {
  migrations: "./migrations",
});
