import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const featureStoreDB = new SQLDatabase("feature_store", {
  migrations: "./migrations",
});
