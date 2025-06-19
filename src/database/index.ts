import Database from 'better-sqlite3';
import { databaseConfig } from '../config/index.js';
import { ProfileRecord, SearchQueryRecord, Location, SearchOperation } from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

const logger = createLogger('database');

export class SearchDatabase {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const path = dbPath || databaseConfig.path;
    this.db = new Database(path);
    this.initializeDatabase();
    logger.info('Database initialized', { path });
  }

  private initializeDatabase(): void {
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Create tables
    this.createTables();
    
    // Create indexes
    this.createIndexes();
    
    logger.info('Database schema created');
  }

  private createTables(): void {
    // Profiles table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        title TEXT,
        company TEXT,
        location TEXT,
        profile_url TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        linkedin_url TEXT,
        source TEXT NOT NULL,
        search_query TEXT NOT NULL,
        search_location TEXT NOT NULL,
        extracted_at DATETIME NOT NULL,
        enriched_at DATETIME,
        relevance_score REAL,
        apollo_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Search queries table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS search_queries (
        id TEXT PRIMARY KEY,
        original_query TEXT NOT NULL,
        expanded_queries TEXT,
        location TEXT NOT NULL,
        results_count INTEGER NOT NULL DEFAULT 0,
        executed_at DATETIME NOT NULL,
        duration INTEGER NOT NULL,
        success BOOLEAN NOT NULL DEFAULT 0,
        error TEXT,
        operation_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Locations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        country TEXT NOT NULL,
        country_code TEXT NOT NULL,
        region TEXT,
        city TEXT,
        search_code TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 1,
        is_active BOOLEAN NOT NULL DEFAULT 1,
        last_searched DATETIME,
        success_rate REAL NOT NULL DEFAULT 0.0,
        total_searches INTEGER NOT NULL DEFAULT 0,
        successful_searches INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Search operations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS search_operations (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
        start_time DATETIME NOT NULL,
        end_time DATETIME,
        total_locations INTEGER NOT NULL DEFAULT 0,
        searched_locations INTEGER NOT NULL DEFAULT 0,
        total_results INTEGER NOT NULL DEFAULT 0,
        current_location TEXT,
        progress REAL NOT NULL DEFAULT 0.0,
        error TEXT,
        config TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // API usage tracking table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_usage (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        status_code INTEGER,
        duration INTEGER NOT NULL,
        success BOOLEAN NOT NULL DEFAULT 0,
        error TEXT,
        rate_limited BOOLEAN NOT NULL DEFAULT 0,
        timestamp DATETIME NOT NULL,
        operation_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  private createIndexes(): void {
    // Profiles indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_profiles_company ON profiles(company)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_profiles_search_query ON profiles(search_query)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_profiles_extracted_at ON profiles(extracted_at)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_profiles_relevance_score ON profiles(relevance_score)');

    // Search queries indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_search_queries_executed_at ON search_queries(executed_at)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_search_queries_operation_id ON search_queries(operation_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_search_queries_location ON search_queries(location)');

    // Locations indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_locations_country ON locations(country)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_locations_priority ON locations(priority)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_locations_is_active ON locations(is_active)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_locations_success_rate ON locations(success_rate)');

    // Search operations indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_search_operations_status ON search_operations(status)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_search_operations_start_time ON search_operations(start_time)');

    // API usage indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_api_usage_provider ON api_usage(provider)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_api_usage_timestamp ON api_usage(timestamp)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_api_usage_operation_id ON api_usage(operation_id)');
  }

  // Profile operations
  async insertProfile(profile: Omit<ProfileRecord, 'id'>): Promise<string> {
    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO profiles (
        id, name, title, company, location, profile_url, email, phone, 
        linkedin_url, source, search_query, search_location, extracted_at, 
        enriched_at, relevance_score, apollo_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id, profile.name, profile.title, profile.company, profile.location,
      profile.profileUrl, profile.email, profile.phone, profile.linkedinUrl,
      profile.source, profile.searchQuery, profile.searchLocation,
      profile.extractedAt.toISOString(), profile.enrichedAt?.toISOString(),
      profile.relevanceScore, profile.apolloData
    );

    logger.info('Profile inserted', { id, name: profile.name });
    return id;
  }

  async getProfiles(filters?: {
    searchQuery?: string;
    location?: string;
    company?: string;
    dateRange?: { start: Date; end: Date };
    limit?: number;
    offset?: number;
  }): Promise<ProfileRecord[]> {
    let query = 'SELECT * FROM profiles WHERE 1=1';
    const params: any[] = [];

    if (filters?.searchQuery) {
      query += ' AND search_query LIKE ?';
      params.push(`%${filters.searchQuery}%`);
    }

    if (filters?.location) {
      query += ' AND search_location LIKE ?';
      params.push(`%${filters.location}%`);
    }

    if (filters?.company) {
      query += ' AND company LIKE ?';
      params.push(`%${filters.company}%`);
    }

    if (filters?.dateRange) {
      query += ' AND extracted_at BETWEEN ? AND ?';
      params.push(filters.dateRange.start.toISOString(), filters.dateRange.end.toISOString());
    }

    query += ' ORDER BY extracted_at DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters?.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      title: row.title,
      company: row.company,
      location: row.location,
      profileUrl: row.profile_url,
      email: row.email,
      phone: row.phone,
      linkedinUrl: row.linkedin_url,
      source: row.source,
      searchQuery: row.search_query,
      searchLocation: row.search_location,
      extractedAt: new Date(row.extracted_at),
      enrichedAt: row.enriched_at ? new Date(row.enriched_at) : undefined,
      relevanceScore: row.relevance_score,
      apolloData: row.apollo_data
    }));
  }

  async updateProfileEnrichment(id: string, apolloData: string, email?: string, phone?: string): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE profiles 
      SET apollo_data = ?, email = COALESCE(?, email), phone = COALESCE(?, phone), 
          enriched_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(apolloData, email, phone, new Date().toISOString(), id);
    logger.info('Profile enrichment updated', { id });
  }

  // Search query operations
  async insertSearchQuery(query: Omit<SearchQueryRecord, 'id'>): Promise<string> {
    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO search_queries (
        id, original_query, expanded_queries, location, results_count, 
        executed_at, duration, success, error, operation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id, query.originalQuery, query.expandedQueries, query.location,
      query.resultsCount, query.executedAt.toISOString(), query.duration,
      query.success ? 1 : 0, query.error, query.operationId
    );

    logger.info('Search query recorded', { id, query: query.originalQuery });
    return id;
  }

  async getSearchHistory(operationId?: string, limit = 100): Promise<SearchQueryRecord[]> {
    let query = 'SELECT * FROM search_queries';
    const params: any[] = [];

    if (operationId) {
      query += ' WHERE operation_id = ?';
      params.push(operationId);
    }

    query += ' ORDER BY executed_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      originalQuery: row.original_query,
      expandedQueries: row.expanded_queries,
      location: row.location,
      resultsCount: row.results_count,
      executedAt: new Date(row.executed_at),
      duration: row.duration,
      success: Boolean(row.success),
      error: row.error,
      operationId: row.operation_id
    }));
  }

  // Location operations
  async insertLocation(location: Omit<Location, 'id'>): Promise<string> {
    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO locations (
        id, name, country, country_code, region, city, search_code, 
        priority, is_active, last_searched, success_rate, total_searches, successful_searches
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id, location.name, location.country, location.countryCode, location.region,
      location.city, location.searchCode, location.priority, location.isActive ? 1 : 0,
      location.lastSearched?.toISOString(), location.successRate, 0, 0
    );

    logger.info('Location inserted', { id, name: location.name });
    return id;
  }

  async getLocations(activeOnly = true): Promise<Location[]> {
    let query = 'SELECT * FROM locations';
    if (activeOnly) {
      query += ' WHERE is_active = 1';
    }
    query += ' ORDER BY priority DESC, success_rate DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      country: row.country,
      countryCode: row.country_code,
      region: row.region,
      city: row.city,
      searchCode: row.search_code,
      priority: row.priority,
      isActive: Boolean(row.is_active),
      lastSearched: row.last_searched ? new Date(row.last_searched) : undefined,
      successRate: row.success_rate
    }));
  }

  async updateLocationStats(id: string, success: boolean): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE locations 
      SET total_searches = total_searches + 1,
          successful_searches = successful_searches + ?,
          success_rate = CAST(successful_searches + ? AS REAL) / (total_searches + 1),
          last_searched = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const successValue = success ? 1 : 0;
    stmt.run(successValue, successValue, new Date().toISOString(), id);
    logger.info('Location stats updated', { id, success });
  }

  // Search operation operations
  async insertSearchOperation(operation: Omit<SearchOperation, 'id'>): Promise<string> {
    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO search_operations (
        id, query, status, start_time, end_time, total_locations, 
        searched_locations, total_results, current_location, progress, error, config
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id, operation.query, operation.status, operation.startTime.toISOString(),
      operation.endTime?.toISOString(), operation.totalLocations, operation.searchedLocations,
      operation.totalResults, operation.currentLocation, operation.progress,
      operation.error, JSON.stringify(operation.config)
    );

    logger.info('Search operation created', { id, query: operation.query });
    return id;
  }

  async updateSearchOperation(id: string, updates: Partial<SearchOperation>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }

    if (updates.endTime !== undefined) {
      fields.push('end_time = ?');
      values.push(updates.endTime.toISOString());
    }

    if (updates.searchedLocations !== undefined) {
      fields.push('searched_locations = ?');
      values.push(updates.searchedLocations);
    }

    if (updates.totalResults !== undefined) {
      fields.push('total_results = ?');
      values.push(updates.totalResults);
    }

    if (updates.currentLocation !== undefined) {
      fields.push('current_location = ?');
      values.push(updates.currentLocation);
    }

    if (updates.progress !== undefined) {
      fields.push('progress = ?');
      values.push(updates.progress);
    }

    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `UPDATE search_operations SET ${fields.join(', ')} WHERE id = ?`;
    const stmt = this.db.prepare(query);
    stmt.run(...values);

    logger.info('Search operation updated', { id, updates: Object.keys(updates) });
  }

  async getSearchOperation(id: string): Promise<SearchOperation | null> {
    const stmt = this.db.prepare('SELECT * FROM search_operations WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      query: row.query,
      status: row.status,
      startTime: new Date(row.start_time),
      endTime: row.end_time ? new Date(row.end_time) : undefined,
      totalLocations: row.total_locations,
      searchedLocations: row.searched_locations,
      totalResults: row.total_results,
      currentLocation: row.current_location,
      progress: row.progress,
      error: row.error,
      config: JSON.parse(row.config)
    };
  }

  async getActiveSearchOperations(): Promise<SearchOperation[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM search_operations 
      WHERE status IN ('pending', 'running') 
      ORDER BY start_time DESC
    `);
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      id: row.id,
      query: row.query,
      status: row.status,
      startTime: new Date(row.start_time),
      endTime: row.end_time ? new Date(row.end_time) : undefined,
      totalLocations: row.total_locations,
      searchedLocations: row.searched_locations,
      totalResults: row.total_results,
      currentLocation: row.current_location,
      progress: row.progress,
      error: row.error,
      config: JSON.parse(row.config)
    }));
  }

  // API usage tracking
  async recordAPIUsage(usage: {
    provider: string;
    endpoint: string;
    method: string;
    statusCode?: number;
    duration: number;
    success: boolean;
    error?: string;
    rateLimited?: boolean;
    operationId?: string;
  }): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO api_usage (
        id, provider, endpoint, method, status_code, duration, 
        success, error, rate_limited, timestamp, operation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      uuidv4(), usage.provider, usage.endpoint, usage.method, usage.statusCode,
      usage.duration, usage.success ? 1 : 0, usage.error, usage.rateLimited ? 1 : 0,
      new Date().toISOString(), usage.operationId
    );
  }

  // Utility methods
  async getStats(): Promise<{
    totalProfiles: number;
    totalSearches: number;
    totalOperations: number;
    activeOperations: number;
    avgSuccessRate: number;
  }> {
    const totalProfiles = this.db.prepare('SELECT COUNT(*) as count FROM profiles').get() as { count: number };
    const totalSearches = this.db.prepare('SELECT COUNT(*) as count FROM search_queries').get() as { count: number };
    const totalOperations = this.db.prepare('SELECT COUNT(*) as count FROM search_operations').get() as { count: number };
    const activeOperations = this.db.prepare(`
      SELECT COUNT(*) as count FROM search_operations 
      WHERE status IN ('pending', 'running')
    `).get() as { count: number };
    const avgSuccessRate = this.db.prepare(`
      SELECT AVG(CAST(success AS REAL)) as rate FROM search_queries
    `).get() as { rate: number };

    return {
      totalProfiles: totalProfiles.count,
      totalSearches: totalSearches.count,
      totalOperations: totalOperations.count,
      activeOperations: activeOperations.count,
      avgSuccessRate: avgSuccessRate.rate || 0
    };
  }

  async cleanup(): Promise<void> {
    // Clean up old API usage records (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const stmt = this.db.prepare('DELETE FROM api_usage WHERE timestamp < ?');
    const result = stmt.run(thirtyDaysAgo.toISOString());
    
    logger.info('Database cleanup completed', { deletedRecords: result.changes });
  }

  close(): void {
    this.db.close();
    logger.info('Database connection closed');
  }
}

// Create and export database instance
export const database = new SearchDatabase();

// Ensure data directory exists
async function ensureDataDirectory() {
  try {
    await mkdir(dirname(databaseConfig.path), { recursive: true });
  } catch (error) {
    logger.error('Failed to create data directory', { error });
  }
}

ensureDataDirectory();