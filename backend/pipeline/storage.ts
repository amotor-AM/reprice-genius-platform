import { Bucket } from "encore.dev/storage/objects";

// Data Lake Layers
export const rawLayerBucket = new Bucket("data-lake-raw");
export const processedLayerBucket = new Bucket("data-lake-processed");
export const analyticsLayerBucket = new Bucket("data-lake-analytics");
