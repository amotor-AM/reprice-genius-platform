import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { graphDB } from "./db";
import { neo4jClient } from "./neo4j_client";
import { ebayDB } from "../ebay/db";

export interface CreateNodeRequest {
  nodeType: 'product' | 'category' | 'brand' | 'competitor' | 'price_point' | 'sale';
  properties: Record<string, any>;
  externalId?: string; // listing_id, category_id, etc.
}

export interface CreateNodeResponse {
  nodeId: string;
  neo4jId: string;
  success: boolean;
}

export interface CreateRelationshipRequest {
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: 'COMPETES_WITH' | 'SIMILAR_TO' | 'PRICED_AT' | 'SOLD_AT' | 'BELONGS_TO';
  properties?: Record<string, any>;
  strength?: number;
}

export interface CreateRelationshipResponse {
  relationshipId: string;
  success: boolean;
}

export interface SyncProductRequest {
  listingId: string;
}

export interface SyncProductResponse {
  productNodeId: string;
  relationshipsCreated: number;
  success: boolean;
}

// Creates a new node in the graph database.
export const createNode = api<CreateNodeRequest, CreateNodeResponse>(
  { auth: true, expose: true, method: "POST", path: "/graph/nodes" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      // Create node in Neo4j
      const labels = [req.nodeType.charAt(0).toUpperCase() + req.nodeType.slice(1)];
      const neo4jId = await neo4jClient.createNode(labels, {
        ...req.properties,
        createdBy: auth.userID,
        createdAt: new Date().toISOString(),
      });

      // Generate unique node ID
      const nodeId = `${req.nodeType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store metadata in PostgreSQL
      await graphDB.exec`
        INSERT INTO graph_nodes (id, node_type, properties, neo4j_id)
        VALUES (${nodeId}, ${req.nodeType}, ${JSON.stringify(req.properties)}, ${parseInt(neo4jId)})
      `;

      return {
        nodeId,
        neo4jId,
        success: true,
      };
    } catch (error) {
      console.error('Error creating graph node:', error);
      throw APIError.internal("Failed to create graph node");
    }
  }
);

// Creates a relationship between two nodes.
export const createRelationship = api<CreateRelationshipRequest, CreateRelationshipResponse>(
  { auth: true, expose: true, method: "POST", path: "/graph/relationships" },
  async (req) => {
    try {
      // Get Neo4j IDs for source and target nodes
      const sourceNode = await graphDB.queryRow`
        SELECT neo4j_id FROM graph_nodes WHERE id = ${req.sourceNodeId}
      `;
      
      const targetNode = await graphDB.queryRow`
        SELECT neo4j_id FROM graph_nodes WHERE id = ${req.targetNodeId}
      `;

      if (!sourceNode || !targetNode) {
        throw APIError.notFound("Source or target node not found");
      }

      // Create relationship in Neo4j
      const neo4jRelId = await neo4jClient.createRelationship(
        sourceNode.neo4j_id.toString(),
        targetNode.neo4j_id.toString(),
        req.relationshipType,
        {
          ...req.properties,
          strength: req.strength || 1.0,
          createdAt: new Date().toISOString(),
        }
      );

      // Store relationship metadata in PostgreSQL
      const relationshipId = await graphDB.queryRow`
        INSERT INTO graph_relationships (
          source_node_id, target_node_id, relationship_type, properties, strength
        ) VALUES (
          ${req.sourceNodeId}, ${req.targetNodeId}, ${req.relationshipType},
          ${JSON.stringify(req.properties || {})}, ${req.strength || 1.0}
        )
        RETURNING id
      `;

      return {
        relationshipId: relationshipId.id.toString(),
        success: true,
      };
    } catch (error) {
      console.error('Error creating graph relationship:', error);
      throw APIError.internal("Failed to create graph relationship");
    }
  }
);

// Syncs a product listing to the graph database.
export const syncProduct = api<SyncProductRequest, SyncProductResponse>(
  { auth: true, expose: true, method: "POST", path: "/graph/sync/product" },
  async (req) => {
    const auth = getAuthData()!;

    try {
      // Get listing details
      const listing = await ebayDB.queryRow`
        SELECT * FROM listings WHERE id = ${req.listingId} AND user_id = ${auth.userID}
      `;

      if (!listing) {
        throw APIError.notFound("Listing not found");
      }

      // Check if product node already exists
      let productNode = await graphDB.queryRow`
        SELECT id, neo4j_id FROM graph_nodes 
        WHERE node_type = 'product' AND properties->>'listingId' = ${req.listingId}
      `;

      let productNodeId: string;
      let relationshipsCreated = 0;

      if (!productNode) {
        // Create product node
        const productResponse = await createNode.call({
          nodeType: 'product',
          properties: {
            listingId: listing.id,
            title: listing.title,
            currentPrice: listing.current_price,
            originalPrice: listing.original_price,
            categoryId: listing.category_id,
            condition: listing.condition_id,
            quantity: listing.quantity,
            views: listing.views,
            watchers: listing.watchers,
            status: listing.listing_status,
          },
        });
        productNodeId = productResponse.nodeId;
      } else {
        productNodeId = productNode.id;
      }

      // Create or update category node and relationship
      if (listing.category_id) {
        let categoryNode = await graphDB.queryRow`
          SELECT id FROM graph_nodes 
          WHERE node_type = 'category' AND properties->>'categoryId' = ${listing.category_id}
        `;

        if (!categoryNode) {
          const categoryResponse = await createNode.call({
            nodeType: 'category',
            properties: {
              categoryId: listing.category_id,
              name: listing.category_id, // In production, fetch actual category name
            },
          });

          // Create BELONGS_TO relationship
          await createRelationship.call({
            sourceNodeId: productNodeId,
            targetNodeId: categoryResponse.nodeId,
            relationshipType: 'BELONGS_TO',
            strength: 1.0,
          });
          relationshipsCreated++;
        }
      }

      // Create price point nodes for current and historical prices
      const pricePointResponse = await createNode.call({
        nodeType: 'price_point',
        properties: {
          price: listing.current_price,
          timestamp: new Date().toISOString(),
          listingId: listing.id,
        },
      });

      // Create PRICED_AT relationship
      await createRelationship.call({
        sourceNodeId: productNodeId,
        targetNodeId: pricePointResponse.nodeId,
        relationshipType: 'PRICED_AT',
        properties: {
          timestamp: new Date().toISOString(),
        },
        strength: 1.0,
      });
      relationshipsCreated++;

      // Find and create competitor relationships
      const competitors = await ebayDB.queryAll`
        SELECT id, title, current_price FROM listings
        WHERE category_id = ${listing.category_id}
          AND condition_id = ${listing.condition_id}
          AND id != ${listing.id}
          AND listing_status = 'active'
        ORDER BY ABS(current_price - ${listing.current_price})
        LIMIT 10
      `;

      for (const competitor of competitors) {
        // Check if competitor node exists
        let competitorNode = await graphDB.queryRow`
          SELECT id FROM graph_nodes 
          WHERE node_type = 'product' AND properties->>'listingId' = ${competitor.id}
        `;

        if (competitorNode) {
          // Create COMPETES_WITH relationship
          const priceRatio = listing.current_price / competitor.current_price;
          const strength = Math.max(0.1, Math.min(1.0, 2 - Math.abs(priceRatio - 1)));

          try {
            await createRelationship.call({
              sourceNodeId: productNodeId,
              targetNodeId: competitorNode.id,
              relationshipType: 'COMPETES_WITH',
              properties: {
                priceRatio,
                priceDifference: Math.abs(listing.current_price - competitor.current_price),
              },
              strength,
            });
            relationshipsCreated++;
          } catch (error) {
            // Relationship might already exist, continue
            console.log('Relationship already exists or error:', error);
          }
        }
      }

      return {
        productNodeId,
        relationshipsCreated,
        success: true,
      };
    } catch (error) {
      console.error('Error syncing product to graph:', error);
      throw APIError.internal("Failed to sync product to graph");
    }
  }
);

// Bulk sync all user's products to the graph
export async function syncAllUserProducts(userId: string): Promise<{ synced: number; errors: number }> {
  try {
    const listings = await ebayDB.queryAll`
      SELECT id FROM listings WHERE user_id = ${userId} AND listing_status = 'active'
    `;

    let synced = 0;
    let errors = 0;

    for (const listing of listings) {
      try {
        await syncProduct.call({ listingId: listing.id });
        synced++;
      } catch (error) {
        console.error(`Error syncing listing ${listing.id}:`, error);
        errors++;
      }
    }

    return { synced, errors };
  } catch (error) {
    console.error('Error in bulk sync:', error);
    throw error;
  }
}

// Get node by external ID (e.g., listing ID)
export async function getNodeByExternalId(nodeType: string, externalId: string): Promise<any> {
  const node = await graphDB.queryRow`
    SELECT * FROM graph_nodes 
    WHERE node_type = ${nodeType} 
      AND (properties->>'listingId' = ${externalId} 
           OR properties->>'categoryId' = ${externalId}
           OR properties->>'brandId' = ${externalId})
  `;

  return node;
}

// Update node properties
export async function updateNodeProperties(nodeId: string, properties: Record<string, any>): Promise<void> {
  const node = await graphDB.queryRow`
    SELECT neo4j_id, properties FROM graph_nodes WHERE id = ${nodeId}
  `;

  if (!node) {
    throw new Error('Node not found');
  }

  // Update in Neo4j
  const cypher = `
    MATCH (n) WHERE id(n) = $nodeId
    SET n += $properties
    RETURN n
  `;

  await neo4jClient.runQuery(cypher, {
    nodeId: parseInt(node.neo4j_id),
    properties,
  });

  // Update in PostgreSQL
  const updatedProperties = { ...node.properties, ...properties };
  await graphDB.exec`
    UPDATE graph_nodes 
    SET properties = ${JSON.stringify(updatedProperties)}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${nodeId}
  `;
}
