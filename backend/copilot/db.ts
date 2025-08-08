import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const copilotDB = new SQLDatabase("copilot", {
  migrations: "./migrations",
});
