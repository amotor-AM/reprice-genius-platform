import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const pricingDB = new SQLDatabase("pricing", {
  migrations: "./migrations",
});
