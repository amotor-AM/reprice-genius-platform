import { secret } from "encore.dev/config";

const neo4jUri = secret("Neo4jUri");
const neo4jUser = secret("Neo4jUser");
const neo4jPassword = secret("Neo4jPassword");

export interface Neo4jNode {
  id: string;
  labels: string[];
  properties: Record<string, any>;
}

export interface Neo4jRelationship {
  id: string;
  type: string;
  startNodeId: string;
  endNodeId: string;
  properties: Record<string, any>;
}

export interface Neo4jQueryResult {
  records: Array<{
    keys: string[];
    _fields: any[];
    _fieldLookup: Record<string, number>;
  }>;
  summary: {
    resultAvailableAfter: number;
    resultConsumedAfter: number;
  };
}

export class Neo4jClient {
  private baseUrl: string;
  private auth: string;

  constructor() {
    this.baseUrl = neo4jUri();
    this.auth = Buffer.from(`${neo4jUser()}:${neo4jPassword()}`).toString('base64');
  }

  async runQuery(cypher: string, parameters: Record<string, any> = {}): Promise<Neo4jQueryResult> {
    try {
      const response = await fetch(`${this.baseUrl}/db/neo4j/tx/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${this.auth}`,
        },
        body: JSON.stringify({
          statements: [{
            statement: cypher,
            parameters,
          }],
        }),
      });

      if (!response.ok) {
        throw new Error(`Neo4j query failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.errors && data.errors.length > 0) {
        throw new Error(`Neo4j error: ${data.errors[0].message}`);
      }

      return data.results[0];
    } catch (error) {
      console.error('Neo4j query error:', error);
      throw error;
    }
  }

  async createNode(labels: string[], properties: Record<string, any>): Promise<string> {
    const labelString = labels.map(label => `:${label}`).join('');
    const cypher = `
      CREATE (n${labelString} $properties)
      RETURN id(n) as nodeId
    `;
    
    const result = await this.runQuery(cypher, { properties });
    return result.records[0]._fields[0].toString();
  }

  async createRelationship(
    sourceId: string,
    targetId: string,
    relationshipType: string,
    properties: Record<string, any> = {}
  ): Promise<string> {
    const cypher = `
      MATCH (a), (b)
      WHERE id(a) = $sourceId AND id(b) = $targetId
      CREATE (a)-[r:${relationshipType} $properties]->(b)
      RETURN id(r) as relId
    `;
    
    const result = await this.runQuery(cypher, { sourceId: parseInt(sourceId), targetId: parseInt(targetId), properties });
    return result.records[0]._fields[0].toString();
  }

  async findNodes(labels: string[], properties: Record<string, any> = {}): Promise<Neo4jNode[]> {
    const labelString = labels.map(label => `:${label}`).join('');
    const whereClause = Object.keys(properties).length > 0 
      ? `WHERE ${Object.keys(properties).map(key => `n.${key} = $${key}`).join(' AND ')}`
      : '';
    
    const cypher = `
      MATCH (n${labelString})
      ${whereClause}
      RETURN id(n) as nodeId, labels(n) as labels, properties(n) as properties
    `;
    
    const result = await this.runQuery(cypher, properties);
    return result.records.map(record => ({
      id: record._fields[0].toString(),
      labels: record._fields[1],
      properties: record._fields[2],
    }));
  }

  async findRelationships(
    sourceId?: string,
    targetId?: string,
    relationshipType?: string
  ): Promise<Neo4jRelationship[]> {
    let cypher = 'MATCH (a)-[r';
    if (relationshipType) {
      cypher += `:${relationshipType}`;
    }
    cypher += ']->(b)';
    
    const conditions: string[] = [];
    const parameters: Record<string, any> = {};
    
    if (sourceId) {
      conditions.push('id(a) = $sourceId');
      parameters.sourceId = parseInt(sourceId);
    }
    
    if (targetId) {
      conditions.push('id(b) = $targetId');
      parameters.targetId = parseInt(targetId);
    }
    
    if (conditions.length > 0) {
      cypher += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    cypher += ' RETURN id(r) as relId, type(r) as relType, id(a) as startId, id(b) as endId, properties(r) as properties';
    
    const result = await this.runQuery(cypher, parameters);
    return result.records.map(record => ({
      id: record._fields[0].toString(),
      type: record._fields[1],
      startNodeId: record._fields[2].toString(),
      endNodeId: record._fields[3].toString(),
      properties: record._fields[4],
    }));
  }

  async runPageRank(nodeLabel: string, relationshipType: string): Promise<Array<{ nodeId: string; score: number }>> {
    const cypher = `
      CALL gds.pageRank.stream({
        nodeProjection: '${nodeLabel}',
        relationshipProjection: '${relationshipType}',
        maxIterations: 20,
        dampingFactor: 0.85
      })
      YIELD nodeId, score
      RETURN gds.util.asNode(nodeId).id as nodeId, score
      ORDER BY score DESC
      LIMIT 100
    `;
    
    const result = await this.runQuery(cypher);
    return result.records.map(record => ({
      nodeId: record._fields[0].toString(),
      score: record._fields[1],
    }));
  }

  async findShortestPath(
    sourceId: string,
    targetId: string,
    relationshipTypeFilter: string[] = []
  ): Promise<Array<{ nodeId: string; relationshipType?: string }>> {
    const relationshipFilter = relationshipTypeFilter.length > 0 
      ? `{relationshipFilter: [${relationshipTypeFilter.map(t => `'${t}'`).join(', ')}]}`
      : '';
    
    const cypher = `
      MATCH (source), (target)
      WHERE id(source) = $sourceId AND id(target) = $targetId
      CALL gds.shortestPath.dijkstra.stream({
        sourceNode: source,
        targetNode: target
        ${relationshipFilter ? ', ' + relationshipFilter : ''}
      })
      YIELD path
      RETURN [node in nodes(path) | id(node)] as nodeIds,
             [rel in relationships(path) | type(rel)] as relTypes
    `;
    
    const result = await this.runQuery(cypher, { 
      sourceId: parseInt(sourceId), 
      targetId: parseInt(targetId) 
    });
    
    if (result.records.length === 0) {
      return [];
    }
    
    const nodeIds = result.records[0]._fields[0];
    const relTypes = result.records[0]._fields[1];
    
    return nodeIds.map((nodeId: string, index: number) => ({
      nodeId: nodeId.toString(),
      relationshipType: index < relTypes.length ? relTypes[index] : undefined,
    }));
  }

  async findCommunities(nodeLabel: string, relationshipType: string): Promise<Array<{ nodeId: string; communityId: number }>> {
    const cypher = `
      CALL gds.louvain.stream({
        nodeProjection: '${nodeLabel}',
        relationshipProjection: '${relationshipType}',
        includeIntermediateCommunities: false
      })
      YIELD nodeId, communityId
      RETURN gds.util.asNode(nodeId).id as nodeId, communityId
      ORDER BY communityId, nodeId
    `;
    
    const result = await this.runQuery(cypher);
    return result.records.map(record => ({
      nodeId: record._fields[0].toString(),
      communityId: record._fields[1],
    }));
  }

  async calculateCentrality(nodeLabel: string, relationshipType: string, algorithm: 'betweenness' | 'closeness' | 'degree' = 'betweenness'): Promise<Array<{ nodeId: string; score: number }>> {
    const cypher = `
      CALL gds.${algorithm}Centrality.stream({
        nodeProjection: '${nodeLabel}',
        relationshipProjection: '${relationshipType}'
      })
      YIELD nodeId, score
      RETURN gds.util.asNode(nodeId).id as nodeId, score
      ORDER BY score DESC
      LIMIT 100
    `;
    
    const result = await this.runQuery(cypher);
    return result.records.map(record => ({
      nodeId: record._fields[0].toString(),
      score: record._fields[1],
    }));
  }
}

export const neo4jClient = new Neo4jClient();
