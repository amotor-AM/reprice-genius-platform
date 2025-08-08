import { api, APIError } from "encore.dev/api";
import { featureStoreDB } from "./db";

export interface FeatureDefinition {
  name: string;
  description: string;
  dataType: 'numeric' | 'categorical' | 'text' | 'vector';
  source: string;
  version: number;
  tags?: string[];
}

export interface FeatureValue {
  entityId: string;
  featureName: string;
  value: any;
  timestamp: Date;
}

// Registers a new feature definition.
export const registerFeature = api<FeatureDefinition, { success: boolean }>(
  { method: "POST", path: "/features/register" },
  async (req) => {
    await featureStoreDB.exec`
      INSERT INTO feature_definitions (name, description, data_type, source, version, tags)
      VALUES (${req.name}, ${req.description}, ${req.dataType}, ${req.source}, ${req.version}, ${req.tags || []})
      ON CONFLICT (name, version) DO UPDATE SET
        description = EXCLUDED.description,
        data_type = EXCLUDED.data_type,
        source = EXCLUDED.source,
        tags = EXCLUDED.tags,
        updated_at = CURRENT_TIMESTAMP
    `;
    return { success: true };
  }
);

// Ingests feature values for an entity.
export const ingestFeatures = api<{ features: FeatureValue[] }, { success: boolean }>(
  { method: "POST", path: "/features/ingest" },
  async (req) => {
    // In a real implementation, use a transaction for bulk inserts
    for (const feature of req.features) {
      await featureStoreDB.exec`
        INSERT INTO feature_values (entity_id, feature_name, feature_value, timestamp)
        VALUES (${feature.entityId}, ${feature.featureName}, ${JSON.stringify(feature.value)}, ${feature.timestamp})
      `;
    }
    return { success: true };
  }
);

// Retrieves the latest feature values for an entity.
export const getFeatures = api<{ entityId: string; featureNames: string[] }, { features: Record<string, any> }>(
  { method: "POST", path: "/features/get" },
  async (req) => {
    const features: Record<string, any> = {};
    for (const featureName of req.featureNames) {
      const result = await featureStoreDB.queryRow`
        SELECT feature_value FROM feature_values
        WHERE entity_id = ${req.entityId} AND feature_name = ${featureName}
        ORDER BY timestamp DESC
        LIMIT 1
      `;
      if (result) {
        features[featureName] = result.feature_value;
      }
    }
    return { features };
  }
);
