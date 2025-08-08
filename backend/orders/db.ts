import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const ordersDB = new SQLDatabase("orders", {
  migrations: "./migrations",
});
