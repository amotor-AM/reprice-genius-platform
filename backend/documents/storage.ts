import { Bucket } from "encore.dev/storage/objects";

// Bucket for storing uploaded documents.
export const documentsBucket = new Bucket("documents", {
  public: false,
});

// Bucket for storing CSV exports.
export const exportsBucket = new Bucket("exports", {
  public: false,
});
