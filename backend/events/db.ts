import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const eventsDB = new SQLDatabase("events", {
  migrations: "./migrations",
});
