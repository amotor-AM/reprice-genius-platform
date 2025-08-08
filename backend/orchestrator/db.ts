import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const orchestratorDB = new SQLDatabase("orchestrator", {
  migrations: "./migrations",
});
