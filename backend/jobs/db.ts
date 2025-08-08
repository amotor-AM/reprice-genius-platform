import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const jobsDB = new SQLDatabase("jobs", {
  migrations: "./migrations",
});
