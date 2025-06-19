import { SearchOperation, SearchOperationConfig, SearchProgress, SearchResult, ProfileRecord } from '../types/index.js';
import { searchEngineManager } from './engines.js';
import { aiProviderManager } from '../ai/index.js';
import { apolloClient } from '../apollo/index.js';
import { locationManager } from '../locations/index.js';
import { database } from '../database/index.js';
import { createLogger, logSearchOperation, logError } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('search-orchestrator');

export class SearchOrchestrator {
  private activeOperations: Map<string, SearchOperation> = new Map();
  private operationTimers: Map<string, NodeJS.Timeout> = new Map();

  async searchProfiles(
    query: string,
    config: SearchOperationConfig = {}
  ): Promise<{ operationId: string; results: SearchResult[] }> {
    const operationId = uuidv4();
    const operation: SearchOperation = {
      id: operationId,
      query,
      status: 'pending',
      startTime: new Date(),
      totalLocations: 1,
      searchedLocations: 0,
      totalResults: 0,
      progress: 0,
      config
    };

    this.activeOperations.set(operationId, operation);
    await database.insertSearchOperation(operation);

    logSearchOperation(operationId, 'started', { query, config });

    try {
      operation.status = 'running';
      await database.updateSearchOperation(operationId, { status: 'running' });

      // Expand query if enabled
      let queries = [query];
      if (config.enableQueryExpansion && aiProviderManager.getAvailableProviders().length > 0) {
        try {
          const expansion = await aiProviderManager.expandQuery({
            originalQuery: query,
            maxQueries: 5
          }, config.aiProvider);
          
          queries = [query, ...expansion.expandedQueries];
          logger.info('Query expanded', { operationId, originalQuery: query, expandedCount: queries.length });
        } catch (error) {
          logger.warn('Query expansion failed, using original query', { operationId, error });
        }
      }

      // Execute searches
      const allResults: SearchResult[] = [];
      for (const searchQuery of queries) {
        try {
          const results = await searchEngineManager.search({
            query: searchQuery,
            maxResults: 10
          });
          allResults.push(...results);
        } catch (error) {
          logger.warn('Search query failed', { operationId, query: searchQuery, error });
        }
      }

      // Filter results if enabled
      let finalResults = allResults;
      if (config.enableResultFiltering && allResults.length > 0 && aiProviderManager.getAvailableProviders().length > 0) {
        try {
          const filtering = await aiProviderManager.filterResults({
            results: allResults,
            originalQuery: query,
            relevanceThreshold: config.relevanceThreshold || 0.7
          }, config.aiProvider);
          
          finalResults = filtering.filteredResults;
          logger.info('Results filtered', { 
            operationId, 
            originalCount: allResults.length, 
            filteredCount: finalResults.length 
          });
        } catch (error) {
          logger.warn('Result filtering failed, using all results', { operationId, error });
        }
      }

      // Store results in database
      for (const result of finalResults) {
        try {
          await this.storeSearchResult(result, query, operationId);
        } catch (error) {
          logger.warn('Failed to store search result', { operationId, result: result.url, error });
        }
      }

      // Complete operation
      operation.status = 'completed';
      operation.endTime = new Date();
      operation.totalResults = finalResults.length;
      operation.progress = 1.0;
      operation.searchedLocations = 1;

      await database.updateSearchOperation(operationId, {
        status: 'completed',
        endTime: operation.endTime,
        totalResults: operation.totalResults,
        progress: operation.progress,
        searchedLocations: operation.searchedLocations
      });

      this.activeOperations.delete(operationId);
      logSearchOperation(operationId, 'completed', { resultsCount: finalResults.length });

      return { operationId, results: finalResults };
    } catch (error) {
      await this.handleOperationError(operationId, error as Error);
      throw error;
    }
  }

  async globalSearchProfiles(
    query: string,
    config: SearchOperationConfig = {}
  ): Promise<string> {
    const operationId = uuidv4();
    const locations = await locationManager.getLocations(config.maxLocations || 10);
    
    const operation: SearchOperation = {
      id: operationId,
      query,
      status: 'pending',
      startTime: new Date(),
      totalLocations: locations.length,
      searchedLocations: 0,
      totalResults: 0,
      progress: 0,
      config
    };

    this.activeOperations.set(operationId, operation);
    await database.insertSearchOperation(operation);

    logSearchOperation(operationId, 'global-started', { 
      query, 
      config, 
      totalLocations: locations.length 
    });

    // Start async processing
    this.processGlobalSearch(operationId, query, locations, config);

    return operationId;
  }

  private async processGlobalSearch(
    operationId: string,
    query: string,
    locations: any[],
    config: SearchOperationConfig
  ): Promise<void> {
    const operation = this.activeOperations.get(operationId);
    if (!operation) return;

    try {
      operation.status = 'running';
      await database.updateSearchOperation(operationId, { status: 'running' });

      // Expand query once if enabled
      let queries = [query];
      if (config.enableQueryExpansion && aiProviderManager.getAvailableProviders().length > 0) {
        try {
          const expansion = await aiProviderManager.expandQuery({
            originalQuery: query,
            maxQueries: 8
          }, config.aiProvider);
          
          queries = [query, ...expansion.expandedQueries];
          logger.info('Global search query expanded', { 
            operationId, 
            originalQuery: query, 
            expandedCount: queries.length 
          });
        } catch (error) {
          logger.warn('Global search query expansion failed', { operationId, error });
        }
      }

      let consecutiveFailures = 0;
      const maxConsecutiveFailures = 3;

      for (let i = 0; i < locations.length; i++) {
        const location = locations[i];
        
        // Check if operation was cancelled
        if (!this.activeOperations.has(operationId)) {
          logger.info('Global search operation cancelled', { operationId });
          return;
        }

        operation.currentLocation = location.name;
        operation.progress = i / locations.length;
        
        await database.updateSearchOperation(operationId, {
          ...(operation.currentLocation && { currentLocation: operation.currentLocation }),
          progress: operation.progress
        });

        logger.info('Searching location', { 
          operationId, 
          location: location.name, 
          progress: `${i + 1}/${locations.length}` 
        });

        try {
          // Search with each query for this location
          const locationResults: SearchResult[] = [];
          
          for (const searchQuery of queries) {
            try {
              const results = await searchEngineManager.search({
                query: searchQuery,
                location: location.searchCode,
                maxResults: 10
              });
              locationResults.push(...results);
            } catch (error) {
              logger.warn('Location search query failed', { 
                operationId, 
                location: location.name, 
                query: searchQuery, 
                error 
              });
            }
          }

          // Filter results if enabled
          let finalResults = locationResults;
          if (config.enableResultFiltering && locationResults.length > 0 && aiProviderManager.getAvailableProviders().length > 0) {
            try {
              const filtering = await aiProviderManager.filterResults({
                results: locationResults,
                originalQuery: query,
                relevanceThreshold: config.relevanceThreshold || 0.7
              }, config.aiProvider);
              
              finalResults = filtering.filteredResults;
            } catch (error) {
              logger.warn('Location result filtering failed', { operationId, location: location.name, error });
            }
          }

          // Store results
          for (const result of finalResults) {
            try {
              await this.storeSearchResult(result, query, operationId, location.name);
            } catch (error) {
              logger.warn('Failed to store location search result', { 
                operationId, 
                location: location.name, 
                result: result.url, 
                error 
              });
            }
          }

          // Enrich contacts if enabled
          if (config.enableContactEnrichment && apolloClient.isConfigured()) {
            await this.enrichLocationResults(operationId, finalResults);
          }

          // Update location success
          await locationManager.updateLocationSuccess(location.id, finalResults.length > 0);
          
          operation.totalResults += finalResults.length;
          operation.searchedLocations = i + 1;
          
          await database.updateSearchOperation(operationId, {
            totalResults: operation.totalResults,
            searchedLocations: operation.searchedLocations
          });

          consecutiveFailures = 0;
          
          logger.info('Location search completed', { 
            operationId, 
            location: location.name, 
            resultsCount: finalResults.length,
            totalResults: operation.totalResults
          });

        } catch (error) {
          consecutiveFailures++;
          logger.error('Location search failed', { 
            operationId, 
            location: location.name, 
            error,
            consecutiveFailures
          });

          // Update location failure
          await locationManager.updateLocationSuccess(location.id, false);
          
          // Blacklist location temporarily on failure
          locationManager.blacklistLocation(location.id, 3600000); // 1 hour

          // Stop if too many consecutive failures
          if (consecutiveFailures >= maxConsecutiveFailures) {
            logger.error('Too many consecutive failures, stopping global search', { 
              operationId, 
              consecutiveFailures 
            });
            break;
          }
        }

        // Delay between searches to avoid rate limiting
        if (i < locations.length - 1) {
          const delay = config.delayBetweenSearches || 120000; // 2 minutes default
          logger.info('Waiting before next location search', { 
            operationId, 
            delayMs: delay,
            nextLocation: locations[i + 1]?.name
          });
          
          await this.sleep(delay);
        }
      }

      // Complete operation
      operation.status = 'completed';
      operation.endTime = new Date();
      operation.progress = 1.0;

      await database.updateSearchOperation(operationId, {
        status: 'completed',
        endTime: operation.endTime,
        progress: operation.progress
      });

      this.activeOperations.delete(operationId);
      logSearchOperation(operationId, 'global-completed', { 
        totalResults: operation.totalResults,
        searchedLocations: operation.searchedLocations
      });

    } catch (error) {
      await this.handleOperationError(operationId, error as Error);
    }
  }

  private async enrichLocationResults(operationId: string, results: SearchResult[]): Promise<void> {
    for (const result of results) {
      try {
        // Extract name and company from result
        const { name, company } = this.extractProfileInfo(result);
        
        if (name) {
          const contact = await apolloClient.enrichContact(name, company);
          if (contact) {
            // Update the stored profile with enrichment data
            await this.updateProfileEnrichment(result.url, contact);
            logger.info('Profile enriched', { operationId, name, company });
          }
        }
      } catch (error) {
        logger.warn('Profile enrichment failed', { operationId, result: result.url, error });
      }
    }
  }

  private extractProfileInfo(result: SearchResult): { name?: string; company?: string } {
    // Extract name and company from LinkedIn profile URL and title
    const name = this.extractNameFromTitle(result.title);
    const company = this.extractCompanyFromSnippet(result.snippet);
    
    return {
      ...(name && { name }),
      ...(company && { company })
    };
  }

  private extractNameFromTitle(title: string): string | undefined {
    // LinkedIn titles typically follow pattern: "Name | Title at Company - LinkedIn"
    const match = title.match(/^([^|]+)/);
    if (match && match[1]) {
      return match[1].trim().replace(/\s*-\s*LinkedIn$/, '');
    }
    return undefined;
  }

  private extractCompanyFromSnippet(snippet: string): string | undefined {
    // Look for company patterns in snippet
    const patterns = [
      /at\s+([^.]+)/i,
      /works?\s+at\s+([^.]+)/i,
      /employed\s+at\s+([^.]+)/i
    ];

    for (const pattern of patterns) {
      const match = snippet.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return undefined;
  }

  private async storeSearchResult(
    result: SearchResult,
    originalQuery: string,
    _operationId: string,
    location?: string
  ): Promise<void> {
    const { name, company } = this.extractProfileInfo(result);
    
    if (name) {
      const profile: Omit<ProfileRecord, 'id'> = {
        name,
        ...(company && { company }),
        profileUrl: result.url,
        source: result.source,
        searchQuery: originalQuery,
        searchLocation: location || 'unknown',
        extractedAt: new Date(),
        ...(result.relevanceScore && { relevanceScore: result.relevanceScore })
      };

      await database.insertProfile(profile);
    }
  }

  private async updateProfileEnrichment(_profileUrl: string, contact: any): Promise<void> {
    // This would require implementing a method to find and update profiles by URL
    // For now, we'll log the enrichment
    logger.info('Profile enrichment data available', { profileUrl: _profileUrl, contact: contact.name });
  }

  private async handleOperationError(operationId: string, error: Error): Promise<void> {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      operation.status = 'failed';
      operation.endTime = new Date();
      operation.error = error.message;

      await database.updateSearchOperation(operationId, {
        status: 'failed',
        endTime: operation.endTime,
        error: operation.error
      });

      this.activeOperations.delete(operationId);
    }

    logSearchOperation(operationId, 'failed', { error: error.message });
    logError(error, { operationId });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getSearchProgress(operationId: string): Promise<SearchProgress | null> {
    const operation = await database.getSearchOperation(operationId);
    if (!operation) return null;

    const estimatedTimeRemaining = this.calculateEstimatedTime(operation);

    return {
      operationId: operation.id,
      status: operation.status,
      progress: operation.progress,
      ...(operation.currentLocation && { currentLocation: operation.currentLocation }),
      searchedLocations: operation.searchedLocations,
      totalLocations: operation.totalLocations,
      resultsFound: operation.totalResults,
      ...(estimatedTimeRemaining !== undefined && { estimatedTimeRemaining }),
      lastUpdate: new Date()
    };
  }

  private calculateEstimatedTime(operation: SearchOperation): number | undefined {
    if (operation.status === 'completed' || operation.status === 'failed') {
      return 0;
    }

    if (operation.searchedLocations === 0) {
      return undefined; // Can't estimate yet
    }

    const elapsed = Date.now() - operation.startTime.getTime();
    const avgTimePerLocation = elapsed / operation.searchedLocations;
    const remainingLocations = operation.totalLocations - operation.searchedLocations;
    
    return Math.round(avgTimePerLocation * remainingLocations);
  }

  async cancelSearch(operationId: string): Promise<boolean> {
    const operation = this.activeOperations.get(operationId);
    if (!operation) return false;

    operation.status = 'cancelled';
    operation.endTime = new Date();

    await database.updateSearchOperation(operationId, {
      status: 'cancelled',
      endTime: operation.endTime
    });

    this.activeOperations.delete(operationId);
    
    // Clear any timers
    const timer = this.operationTimers.get(operationId);
    if (timer) {
      clearTimeout(timer);
      this.operationTimers.delete(operationId);
    }

    logSearchOperation(operationId, 'cancelled');
    return true;
  }

  getActiveOperations(): SearchOperation[] {
    return Array.from(this.activeOperations.values());
  }

  async getSearchHistory(_limit = 50): Promise<SearchOperation[]> {
    // This would require implementing a method to get search operations from database
    return [];
  }
}

// Export singleton instance
export const searchOrchestrator = new SearchOrchestrator();