import { config } from 'dotenv';
import { ServerConfig, AIProvider, SearchEngineConfig } from '../types/index.js';

// Load environment variables
config();

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (!value && !defaultValue) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value || defaultValue!;
}

function getEnvNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }
  return parsed;
}

// function getEnvBoolean(name: string, defaultValue: boolean): boolean {
//   const value = process.env[name];
//   if (!value) return defaultValue;
//   return value.toLowerCase() === 'true';
// }

// AI Providers Configuration
const aiProviders: ServerConfig['aiProviders'] = {};

if (process.env.OPENAI_API_KEY) {
  aiProviders.openai = {
    name: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4',
    maxTokens: 2000,
    temperature: 0.7
  };
}

if (process.env.GOOGLE_GEMINI_API_KEY) {
  aiProviders.gemini = {
    name: 'gemini',
    apiKey: process.env.GOOGLE_GEMINI_API_KEY,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-pro',
    maxTokens: 2000,
    temperature: 0.7
  };
}

if (process.env.OPENROUTER_API_KEY) {
  aiProviders.openrouter = {
    name: 'openrouter',
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3-sonnet',
    maxTokens: 2000,
    temperature: 0.7
  };
}

if (process.env.OLLAMA_BASE_URL) {
  aiProviders.ollama = {
    name: 'ollama',
    apiKey: '', // Ollama doesn't require API key for local usage
    baseUrl: getEnvVar('OLLAMA_BASE_URL', 'http://localhost:11434'),
    model: getEnvVar('OLLAMA_MODEL', 'llama2'),
    maxTokens: 2000,
    temperature: 0.7
  };
}

// Google Search Configuration
let googleSearch: SearchEngineConfig | undefined;
if (process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID) {
  googleSearch = {
    apiKey: process.env.GOOGLE_SEARCH_API_KEY,
    engineId: process.env.GOOGLE_SEARCH_ENGINE_ID,
    baseUrl: 'https://www.googleapis.com/customsearch/v1',
    rateLimit: getEnvNumber('GOOGLE_SEARCH_RATE_LIMIT', 100),
    timeout: getEnvNumber('SEARCH_TIMEOUT_MS', 30000)
  };
}

// Apollo Configuration
let apollo: ServerConfig['apollo'] | undefined;
if (process.env.APOLLO_API_KEY) {
  apollo = {
    apiKey: process.env.APOLLO_API_KEY,
    baseUrl: 'https://api.apollo.io/v1'
  };
}

// Main Configuration
export const serverConfig: ServerConfig = {
  database: {
    path: getEnvVar('DATABASE_PATH', './data/search.db')
  },
  search: {
    defaultDelayMs: getEnvNumber('DEFAULT_SEARCH_DELAY_MS', 120000),
    maxResults: getEnvNumber('MAX_SEARCH_RESULTS', 100),
    maxLocations: getEnvNumber('MAX_LOCATIONS_PER_SEARCH', 50),
    timeoutMs: getEnvNumber('SEARCH_TIMEOUT_MS', 30000)
  },
  rateLimits: {
    googleSearch: getEnvNumber('GOOGLE_SEARCH_RATE_LIMIT', 100),
    apollo: getEnvNumber('APOLLO_RATE_LIMIT', 1000),
    aiProvider: getEnvNumber('AI_PROVIDER_RATE_LIMIT', 60)
  },
  logging: {
    level: getEnvVar('LOG_LEVEL', 'info'),
    ...(process.env.LOG_FILE && { file: process.env.LOG_FILE })
  },
  aiProviders,
  ...(apollo && { apollo }),
  ...(googleSearch && { googleSearch })
};

// Validation
export function validateConfig(): void {
  // Check if at least one AI provider is configured
  if (Object.keys(serverConfig.aiProviders).length === 0) {
    console.warn('Warning: No AI providers configured. Query expansion and filtering will be disabled.');
  }

  // Check if Google Search is configured
  if (!serverConfig.googleSearch) {
    console.warn('Warning: Google Search API not configured. Search functionality will be limited.');
  }

  // Check if Apollo is configured
  if (!serverConfig.apollo) {
    console.warn('Warning: Apollo API not configured. Contact enrichment will be disabled.');
  }

  // Validate database path
  const dbPath = serverConfig.database.path;
  if (!dbPath.endsWith('.db')) {
    throw new Error('Database path must end with .db extension');
  }

  // Validate rate limits
  if (serverConfig.rateLimits.googleSearch <= 0) {
    throw new Error('Google Search rate limit must be greater than 0');
  }

  if (serverConfig.rateLimits.apollo <= 0) {
    throw new Error('Apollo rate limit must be greater than 0');
  }

  if (serverConfig.rateLimits.aiProvider <= 0) {
    throw new Error('AI Provider rate limit must be greater than 0');
  }

  // Validate search configuration
  if (serverConfig.search.defaultDelayMs < 30000) {
    console.warn('Warning: Search delay is less than 30 seconds. This may trigger rate limiting.');
  }

  if (serverConfig.search.maxResults > 100) {
    console.warn('Warning: Max results is greater than 100. This may impact performance.');
  }

  if (serverConfig.search.maxLocations > 50) {
    console.warn('Warning: Max locations is greater than 50. This may result in very long search operations.');
  }
}

// Helper functions for getting specific configurations
export function getAIProvider(name: string): AIProvider | undefined {
  return serverConfig.aiProviders[name as keyof typeof serverConfig.aiProviders];
}

export function getAvailableAIProviders(): string[] {
  return Object.keys(serverConfig.aiProviders);
}

export function isGoogleSearchConfigured(): boolean {
  return !!serverConfig.googleSearch;
}

export function isApolloConfigured(): boolean {
  return !!serverConfig.apollo;
}

export function getDefaultAIProvider(): string | undefined {
  const providers = getAvailableAIProviders();
  if (providers.length === 0) return undefined;
  
  // Prefer OpenAI, then Gemini, then OpenRouter, then Ollama
  const preferenceOrder = ['openai', 'gemini', 'openrouter', 'ollama'];
  for (const provider of preferenceOrder) {
    if (providers.includes(provider)) {
      return provider;
    }
  }
  
  return providers[0];
}

// Export individual configurations for easier access
export const databaseConfig = serverConfig.database;
export const searchConfig = serverConfig.search;
export const rateLimitConfig = serverConfig.rateLimits;
export const loggingConfig = serverConfig.logging;
export const aiProvidersConfig = serverConfig.aiProviders;
export const apolloConfig = serverConfig.apollo;
export const googleSearchConfig = serverConfig.googleSearch;