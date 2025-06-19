import axios, { AxiosResponse } from 'axios';
import { SearchResult, SearchQuery, SearchEngineConfig, SearchEngineError } from '../types/index.js';
import { googleSearchConfig } from '../config/index.js';
import { createLogger, logAPICall, logError } from '../utils/logger.js';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const logger = createLogger('search-engines');

export interface SearchEngine {
  name: string;
  search(query: SearchQuery): Promise<SearchResult[]>;
  isConfigured(): boolean;
}

export class GoogleSearchEngine implements SearchEngine {
  name = 'google';
  private config: SearchEngineConfig;
  private rateLimiter: RateLimiterMemory;

  constructor(config?: SearchEngineConfig) {
    this.config = config || googleSearchConfig || {
      apiKey: '',
      engineId: '',
      baseUrl: 'https://www.googleapis.com/customsearch/v1',
      rateLimit: 100,
      timeout: 30000
    };

    // Rate limiter: allow rateLimit requests per day
    this.rateLimiter = new RateLimiterMemory({
      points: this.config.rateLimit || 100,
      duration: 86400 // 24 hours in seconds
    });

    logger.info('Google Search Engine initialized', { 
      configured: this.isConfigured(),
      rateLimit: this.config.rateLimit 
    });
  }

  isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.engineId);
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    if (!this.isConfigured()) {
      throw new SearchEngineError(
        'Google Search API not configured',
        this.name
      );
    }

    // Check rate limit
    try {
      await this.rateLimiter.consume('google-search');
    } catch (rateLimitError) {
      throw new SearchEngineError(
        'Google Search API rate limit exceeded',
        this.name,
        429
      );
    }

    const startTime = Date.now();

    try {
      const params = this.buildSearchParams(query);
      
      const response: AxiosResponse = await axios.get(this.config.baseUrl!, {
        params,
        timeout: this.config.timeout || 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SearchMCPServer/1.0)'
        }
      });

      const duration = Date.now() - startTime;
      logAPICall(this.name, 'search', duration, true);

      const results = this.parseSearchResults(response.data, query);
      
      logger.info('Google search completed', {
        query: query.query,
        location: query.location,
        resultsCount: results.length,
        duration
      });

      return results;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const statusCode = axios.isAxiosError(error) ? error.response?.status : undefined;
      
      logAPICall(this.name, 'search', duration, false, errorMessage);
      logError(error as Error, { query, config: this.config });

      throw new SearchEngineError(
        `Google search failed: ${errorMessage}`,
        this.name,
        statusCode,
        error as Error
      );
    }
  }

  private buildSearchParams(query: SearchQuery): Record<string, string> {
    const params: Record<string, string> = {
      key: this.config.apiKey,
      cx: this.config.engineId!,
      q: this.buildSearchString(query),
      num: Math.min(query.maxResults || 10, 10).toString(), // Google API max is 10
      safe: 'off',
      fields: 'items(title,link,snippet,displayLink,pagemap)'
    };

    if (query.language) {
      params.lr = `lang_${query.language}`;
    }

    if (query.dateRestrict) {
      params.dateRestrict = query.dateRestrict;
    }

    return params;
  }

  private buildSearchString(query: SearchQuery): string {
    let searchString = query.query;

    // Add LinkedIn-specific search operators
    if (!searchString.includes('site:')) {
      searchString += ' site:linkedin.com/in/';
    }

    // Add location if specified
    if (query.location && !searchString.includes(query.location)) {
      searchString += ` "${query.location}"`;
    }

    return searchString;
  }

  private parseSearchResults(data: any, query: SearchQuery): SearchResult[] {
    if (!data.items || !Array.isArray(data.items)) {
      return [];
    }

    return data.items.map((item: any) => ({
      title: item.title || '',
      url: item.link || '',
      snippet: item.snippet || '',
      displayUrl: item.displayLink || '',
      source: this.name,
      timestamp: new Date(),
      relevanceScore: this.calculateRelevanceScore(item, query)
    }));
  }

  private calculateRelevanceScore(item: any, query: SearchQuery): number {
    let score = 0.5; // Base score

    const title = (item.title || '').toLowerCase();
    const snippet = (item.snippet || '').toLowerCase();
    const queryLower = query.query.toLowerCase();

    // Check for LinkedIn profile indicators
    if (item.link && item.link.includes('linkedin.com/in/')) {
      score += 0.3;
    }

    // Check for query terms in title (higher weight)
    const queryTerms = queryLower.split(' ').filter(term => term.length > 2);
    const titleMatches = queryTerms.filter(term => title.includes(term)).length;
    score += (titleMatches / queryTerms.length) * 0.3;

    // Check for query terms in snippet
    const snippetMatches = queryTerms.filter(term => snippet.includes(term)).length;
    score += (snippetMatches / queryTerms.length) * 0.2;

    // Check for professional keywords
    const professionalKeywords = ['ceo', 'cto', 'manager', 'director', 'engineer', 'developer', 'analyst', 'consultant'];
    const professionalMatches = professionalKeywords.filter(keyword => 
      title.includes(keyword) || snippet.includes(keyword)
    ).length;
    score += Math.min(professionalMatches * 0.1, 0.2);

    // Location bonus
    if (query.location) {
      const locationLower = query.location.toLowerCase();
      if (title.includes(locationLower) || snippet.includes(locationLower)) {
        score += 0.1;
      }
    }

    return Math.min(score, 1.0);
  }
}

export class FallbackSearchEngine implements SearchEngine {
  name = 'fallback';

  isConfigured(): boolean {
    return true; // Always available as fallback
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    logger.warn('Using fallback search engine', { query: query.query });
    
    // This is a placeholder implementation
    // In a real scenario, you might implement web scraping or other search methods
    return [];
  }
}

export class SearchEngineManager {
  private engines: Map<string, SearchEngine> = new Map();
  private primaryEngine: string = 'google';

  constructor() {
    this.initializeEngines();
  }

  private initializeEngines(): void {
    // Initialize Google Search Engine
    const googleEngine = new GoogleSearchEngine();
    this.engines.set('google', googleEngine);

    // Initialize fallback engine
    const fallbackEngine = new FallbackSearchEngine();
    this.engines.set('fallback', fallbackEngine);

    // Set primary engine based on configuration
    if (googleEngine.isConfigured()) {
      this.primaryEngine = 'google';
    } else {
      this.primaryEngine = 'fallback';
      logger.warn('Google Search not configured, using fallback engine');
    }

    logger.info('Search engines initialized', { 
      primary: this.primaryEngine,
      available: Array.from(this.engines.keys())
    });
  }

  async search(query: SearchQuery, engineName?: string): Promise<SearchResult[]> {
    const engine = this.getEngine(engineName);
    
    try {
      const results = await engine.search(query);
      
      // Deduplicate results by URL
      const uniqueResults = this.deduplicateResults(results);
      
      logger.info('Search completed', {
        engine: engine.name,
        query: query.query,
        originalCount: results.length,
        uniqueCount: uniqueResults.length
      });

      return uniqueResults;
    } catch (error) {
      logger.error('Search failed with primary engine, trying fallback', {
        primaryEngine: engine.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Try fallback if primary fails
      if (engine.name !== 'fallback') {
        const fallbackEngine = this.engines.get('fallback');
        if (fallbackEngine) {
          return await fallbackEngine.search(query);
        }
      }

      throw error;
    }
  }

  private getEngine(engineName?: string): SearchEngine {
    const name = engineName || this.primaryEngine;
    const engine = this.engines.get(name);
    
    if (!engine) {
      throw new SearchEngineError(`Search engine not found: ${name}`, name);
    }

    return engine;
  }

  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    const unique: SearchResult[] = [];

    for (const result of results) {
      const normalizedUrl = this.normalizeUrl(result.url);
      if (!seen.has(normalizedUrl)) {
        seen.add(normalizedUrl);
        unique.push(result);
      }
    }

    return unique;
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove query parameters and fragments for deduplication
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      return url;
    }
  }

  getAvailableEngines(): string[] {
    return Array.from(this.engines.keys());
  }

  isEngineConfigured(engineName: string): boolean {
    const engine = this.engines.get(engineName);
    return engine ? engine.isConfigured() : false;
  }

  setPrimaryEngine(engineName: string): void {
    if (!this.engines.has(engineName)) {
      throw new SearchEngineError(`Search engine not found: ${engineName}`, engineName);
    }

    this.primaryEngine = engineName;
    logger.info('Primary search engine changed', { engine: engineName });
  }

  addEngine(name: string, engine: SearchEngine): void {
    this.engines.set(name, engine);
    logger.info('Search engine added', { name, configured: engine.isConfigured() });
  }
}

// Export singleton instance
export const searchEngineManager = new SearchEngineManager();