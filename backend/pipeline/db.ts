import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const pipelineDB = new SQLDatabase("pipeline", {
  migrations: "./migrations",
});
