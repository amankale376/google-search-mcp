import { z } from 'zod';

// Search Engine Types
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  displayUrl?: string;
  source: string;
  timestamp: Date;
  relevanceScore?: number;
}

export interface SearchQuery {
  query: string;
  location?: string;
  maxResults?: number;
  language?: string;
  dateRestrict?: string;
}

export interface SearchEngineConfig {
  apiKey: string;
  engineId?: string;
  baseUrl?: string;
  rateLimit?: number;
  timeout?: number;
}

// Location Types
export interface Location {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  region?: string;
  city?: string;
  searchCode: string;
  priority: number;
  isActive: boolean;
  lastSearched?: Date | undefined;
  successRate: number;
}

export interface LocationQueue {
  locations: Location[];
  currentIndex: number;
  blacklistedLocations: Set<string>;
}

// Apollo API Types
export interface ApolloContact {
  id?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  facebookUrl?: string;
  organization?: {
    name?: string;
    websiteUrl?: string;
    industry?: string;
    size?: string;
  };
}

export interface ApolloSearchParams {
  personTitles?: string[];
  organizationNames?: string[];
  personLocations?: string[];
  organizationLocations?: string[];
  personSeniorities?: string[];
  contactEmailStatus?: string[];
  limit?: number;
  page?: number;
}

// AI Provider Types
export interface AIProvider {
  name: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface QueryExpansionRequest {
  originalQuery: string;
  location?: string;
  context?: string;
  maxQueries?: number;
}

export interface QueryExpansionResponse {
  expandedQueries: string[];
  confidence: number;
  reasoning?: string;
}

export interface ResultFilterRequest {
  results: SearchResult[];
  originalQuery: string;
  relevanceThreshold?: number;
}

export interface ResultFilterResponse {
  filteredResults: SearchResult[];
  removedCount: number;
  reasoning?: string;
}

// Search Operation Types
export interface SearchOperation {
  id: string;
  query: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date | undefined;
  totalLocations: number;
  searchedLocations: number;
  totalResults: number;
  currentLocation?: string;
  progress: number;
  error?: string;
  config: SearchOperationConfig;
}

export interface SearchOperationConfig {
  maxLocations?: number;
  delayBetweenSearches?: number;
  enableQueryExpansion?: boolean;
  enableResultFiltering?: boolean;
  enableContactEnrichment?: boolean;
  aiProvider?: string;
  relevanceThreshold?: number;
}

export interface SearchProgress {
  operationId: string;
  status: string;
  progress: number;
  currentLocation?: string;
  searchedLocations: number;
  totalLocations: number;
  resultsFound: number;
  estimatedTimeRemaining?: number;
  lastUpdate: Date;
}

// Database Types
export interface ProfileRecord {
  id: string;
  name: string;
  title?: string;
  company?: string;
  location?: string;
  profileUrl: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  source: string;
  searchQuery: string;
  searchLocation: string;
  extractedAt: Date;
  enrichedAt?: Date | undefined;
  relevanceScore?: number;
  apolloData?: string; // JSON string
}

export interface SearchQueryRecord {
  id: string;
  originalQuery: string;
  expandedQueries?: string; // JSON string
  location: string;
  resultsCount: number;
  executedAt: Date;
  duration: number;
  success: boolean;
  error?: string;
  operationId?: string;
}

// MCP Tool Schemas
export const SearchProfilesSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  location: z.string().optional(),
  maxResults: z.number().min(1).max(100).default(20),
  enableQueryExpansion: z.boolean().default(true),
  enableResultFiltering: z.boolean().default(true),
  aiProvider: z.enum(['openai', 'gemini', 'openrouter', 'ollama']).default('openai')
});

export const GlobalSearchProfilesSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  maxLocations: z.number().min(1).max(50).default(10),
  delayBetweenSearches: z.number().min(30000).max(600000).default(120000),
  enableQueryExpansion: z.boolean().default(true),
  enableResultFiltering: z.boolean().default(true),
  enableContactEnrichment: z.boolean().default(false),
  aiProvider: z.enum(['openai', 'gemini', 'openrouter', 'ollama']).default('openai'),
  relevanceThreshold: z.number().min(0).max(1).default(0.7)
});

export const GetContactInfoSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  company: z.string().optional(),
  email: z.string().email().optional(),
  linkedinUrl: z.string().url().optional()
});

export const SetupSearchEngineSchema = z.object({
  provider: z.enum(['google', 'bing', 'duckduckgo']).default('google'),
  apiKey: z.string().optional(),
  engineId: z.string().optional(),
  rateLimit: z.number().min(1).max(1000).default(100),
  timeout: z.number().min(5000).max(60000).default(30000)
});

export const ExportResultsSchema = z.object({
  operationId: z.string().optional(),
  format: z.enum(['json', 'csv', 'xlsx']).default('json'),
  includeEnrichment: z.boolean().default(true),
  dateRange: z.object({
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional()
  }).optional()
});

// Error Types
export class SearchEngineError extends Error {
  constructor(
    message: string,
    public provider: string,
    public statusCode?: number,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'SearchEngineError';
  }
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public statusCode?: number,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

export class ApolloAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'ApolloAPIError';
  }
}

export class DatabaseError extends Error {
  constructor(
    message: string,
    public operation: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

// Configuration Types
export interface ServerConfig {
  database: {
    path: string;
  };
  search: {
    defaultDelayMs: number;
    maxResults: number;
    maxLocations: number;
    timeoutMs: number;
  };
  rateLimits: {
    googleSearch: number;
    apollo: number;
    aiProvider: number;
  };
  logging: {
    level: string;
    file?: string;
  };
  aiProviders: {
    openai?: AIProvider;
    gemini?: AIProvider;
    openrouter?: AIProvider;
    ollama?: AIProvider;
  };
  apollo?: {
    apiKey: string;
    baseUrl?: string;
  };
  googleSearch?: SearchEngineConfig;
}

export type SearchProfilesInput = z.infer<typeof SearchProfilesSchema>;
export type GlobalSearchProfilesInput = z.infer<typeof GlobalSearchProfilesSchema>;
export type GetContactInfoInput = z.infer<typeof GetContactInfoSchema>;
export type SetupSearchEngineInput = z.infer<typeof SetupSearchEngineSchema>;
export type ExportResultsInput = z.infer<typeof ExportResultsSchema>;