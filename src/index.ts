import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { 
  SearchProfilesSchema, 
  GlobalSearchProfilesSchema, 
  GetContactInfoSchema, 
  SetupSearchEngineSchema, 
  ExportResultsSchema,
  SearchProfilesInput,
  GlobalSearchProfilesInput,
  GetContactInfoInput,
  SetupSearchEngineInput,
  ExportResultsInput
} from './types/index.js';
import { searchOrchestrator } from './search/orchestrator.js';
import { apolloClient } from './apollo/index.js';
import { database } from './database/index.js';
import { locationManager } from './locations/index.js';
import { searchEngineManager } from './search/engines.js';
import { validateConfig } from './config/index.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('mcp-server');

class SearchMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'search-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_profiles',
            description: 'Search for LinkedIn profiles using keywords and optional location',
            inputSchema: SearchProfilesSchema,
          },
          {
            name: 'global_search_profiles',
            description: 'Perform a comprehensive search across multiple global locations with rate limiting',
            inputSchema: GlobalSearchProfilesSchema,
          },
          {
            name: 'get_contact_info',
            description: 'Enrich contact information using Apollo API',
            inputSchema: GetContactInfoSchema,
          },
          {
            name: 'setup_search_engine',
            description: 'Configure search engine parameters and API keys',
            inputSchema: SetupSearchEngineSchema,
          },
          {
            name: 'get_search_progress',
            description: 'Get progress information for a running search operation',
            inputSchema: {
              type: 'object',
              properties: {
                operationId: {
                  type: 'string',
                  description: 'The ID of the search operation to check'
                }
              },
              required: ['operationId']
            }
          },
          {
            name: 'cancel_search',
            description: 'Cancel a running search operation',
            inputSchema: {
              type: 'object',
              properties: {
                operationId: {
                  type: 'string',
                  description: 'The ID of the search operation to cancel'
                }
              },
              required: ['operationId']
            }
          },
          {
            name: 'get_search_history',
            description: 'Retrieve historical search data and operations',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of records to return',
                  default: 50
                },
                operationId: {
                  type: 'string',
                  description: 'Filter by specific operation ID'
                }
              }
            }
          },
          {
            name: 'export_results',
            description: 'Export search results in various formats (JSON, CSV, XLSX)',
            inputSchema: ExportResultsSchema,
          },
          {
            name: 'get_server_stats',
            description: 'Get server statistics and health information',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          }
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_profiles':
            return await this.handleSearchProfiles(args as SearchProfilesInput);

          case 'global_search_profiles':
            return await this.handleGlobalSearchProfiles(args as GlobalSearchProfilesInput);

          case 'get_contact_info':
            return await this.handleGetContactInfo(args as GetContactInfoInput);

          case 'setup_search_engine':
            return await this.handleSetupSearchEngine(args as SetupSearchEngineInput);

          case 'get_search_progress':
            return await this.handleGetSearchProgress(args as { operationId: string });

          case 'cancel_search':
            return await this.handleCancelSearch(args as { operationId: string });

          case 'get_search_history':
            return await this.handleGetSearchHistory(args as { limit?: number; operationId?: string });

          case 'export_results':
            return await this.handleExportResults(args as ExportResultsInput);

          case 'get_server_stats':
            return await this.handleGetServerStats();

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        logger.error('Tool execution failed', { tool: name, error, args });
        
        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
  }

  private setupResourceHandlers(): void {
    // Resources will be implemented here for accessing search data
    // For now, we'll focus on the tools
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      logger.error('MCP Server error', { error });
    };

    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await this.cleanup();
      process.exit(0);
    });
  }

  // Tool handlers
  private async handleSearchProfiles(args: SearchProfilesInput) {
    logger.info('Executing search_profiles', { args });

    const result = await searchOrchestrator.searchProfiles(args.query, {
      enableQueryExpansion: args.enableQueryExpansion,
      enableResultFiltering: args.enableResultFiltering,
      aiProvider: args.aiProvider,
      maxLocations: 1
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            operationId: result.operationId,
            query: args.query,
            resultsCount: result.results.length,
            results: result.results.slice(0, args.maxResults),
            message: `Found ${result.results.length} profiles for query: "${args.query}"`
          }, null, 2)
        }
      ]
    };
  }

  private async handleGlobalSearchProfiles(args: GlobalSearchProfilesInput) {
    logger.info('Executing global_search_profiles', { args });

    const operationId = await searchOrchestrator.globalSearchProfiles(args.query, {
      maxLocations: args.maxLocations,
      delayBetweenSearches: args.delayBetweenSearches,
      enableQueryExpansion: args.enableQueryExpansion,
      enableResultFiltering: args.enableResultFiltering,
      enableContactEnrichment: args.enableContactEnrichment,
      aiProvider: args.aiProvider,
      relevanceThreshold: args.relevanceThreshold
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            operationId,
            query: args.query,
            status: 'started',
            maxLocations: args.maxLocations,
            message: `Global search operation started with ID: ${operationId}. Use get_search_progress to monitor progress.`
          }, null, 2)
        }
      ]
    };
  }

  private async handleGetContactInfo(args: GetContactInfoInput) {
    logger.info('Executing get_contact_info', { args });

    if (!apolloClient.isConfigured()) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Apollo API is not configured. Please set APOLLO_API_KEY environment variable.'
      );
    }

    const contact = await apolloClient.enrichContact(
      args.name,
      args.company,
      args.email,
      args.linkedinUrl
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            name: args.name,
            found: !!contact,
            contact: contact || null,
            message: contact 
              ? `Contact information found for ${args.name}`
              : `No contact information found for ${args.name}`
          }, null, 2)
        }
      ]
    };
  }

  private async handleSetupSearchEngine(args: SetupSearchEngineInput) {
    logger.info('Executing setup_search_engine', { args });

    // This would typically update configuration
    // For now, we'll return current configuration status
    const isConfigured = searchEngineManager.isEngineConfigured(args.provider);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            provider: args.provider,
            configured: isConfigured,
            availableEngines: searchEngineManager.getAvailableEngines(),
            message: `Search engine ${args.provider} is ${isConfigured ? 'configured' : 'not configured'}`
          }, null, 2)
        }
      ]
    };
  }

  private async handleGetSearchProgress(args: { operationId: string }) {
    logger.info('Executing get_search_progress', { args });

    const progress = await searchOrchestrator.getSearchProgress(args.operationId);

    if (!progress) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Search operation not found: ${args.operationId}`
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(progress, null, 2)
        }
      ]
    };
  }

  private async handleCancelSearch(args: { operationId: string }) {
    logger.info('Executing cancel_search', { args });

    const cancelled = await searchOrchestrator.cancelSearch(args.operationId);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            operationId: args.operationId,
            cancelled,
            message: cancelled 
              ? `Search operation ${args.operationId} has been cancelled`
              : `Search operation ${args.operationId} could not be cancelled (may not exist or already completed)`
          }, null, 2)
        }
      ]
    };
  }

  private async handleGetSearchHistory(args: { limit?: number; operationId?: string }) {
    logger.info('Executing get_search_history', { args });

    const history = await database.getSearchHistory(args.operationId, args.limit || 50);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: history.length,
            history,
            message: `Retrieved ${history.length} search history records`
          }, null, 2)
        }
      ]
    };
  }

  private async handleExportResults(args: ExportResultsInput) {
    logger.info('Executing export_results', { args });

    // Get profiles from database
    const filters: any = {};
    
    if (args.operationId) {
      // This would require implementing operation-specific filtering
      filters.operationId = args.operationId;
    }

    if (args.dateRange) {
      filters.dateRange = {
        start: new Date(args.dateRange.start!),
        end: new Date(args.dateRange.end!)
      };
    }

    const profiles = await database.getProfiles(filters);

    // Format based on requested format
    let exportData: any;
    switch (args.format) {
      case 'json':
        exportData = profiles;
        break;
      case 'csv':
        // Convert to CSV format (simplified)
        const csvHeaders = ['name', 'title', 'company', 'location', 'profileUrl', 'email', 'phone'];
        const csvRows = profiles.map(p => csvHeaders.map(h => (p as any)[h] || '').join(','));
        exportData = [csvHeaders.join(','), ...csvRows].join('\n');
        break;
      default:
        exportData = profiles;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            format: args.format,
            count: profiles.length,
            data: exportData,
            message: `Exported ${profiles.length} profiles in ${args.format} format`
          }, null, 2)
        }
      ]
    };
  }

  private async handleGetServerStats() {
    logger.info('Executing get_server_stats');

    const dbStats = await database.getStats();
    const activeOperations = searchOrchestrator.getActiveOperations();
    const locationStats = locationManager.getLocationStats();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            database: dbStats,
            activeOperations: {
              count: activeOperations.length,
              operations: activeOperations.map(op => ({
                id: op.id,
                query: op.query,
                status: op.status,
                progress: op.progress
              }))
            },
            locations: locationStats,
            apis: {
              apollo: apolloClient.isConfigured(),
              googleSearch: searchEngineManager.isEngineConfigured('google')
            },
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            message: 'Server statistics retrieved successfully'
          }, null, 2)
        }
      ]
    };
  }

  private async cleanup(): Promise<void> {
    logger.info('Cleaning up server resources...');
    
    try {
      // Cancel all active operations
      const activeOperations = searchOrchestrator.getActiveOperations();
      for (const operation of activeOperations) {
        await searchOrchestrator.cancelSearch(operation.id);
      }

      // Close database connection
      database.close();

      logger.info('Server cleanup completed');
    } catch (error) {
      logger.error('Error during cleanup', { error });
    }
  }

  async run(): Promise<void> {
    // Validate configuration
    validateConfig();

    // Initialize components
    await locationManager.initialize();

    logger.info('Search MCP Server starting...');

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info('Search MCP Server started successfully');
  }
}

// Start the server
async function main() {
  try {
    const server = new SearchMCPServer();
    await server.run();
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  process.exit(1);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}