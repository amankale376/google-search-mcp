# Search MCP Server

A comprehensive Node.js Model Context Protocol (MCP) server for advanced search functionality with LinkedIn profile mining, AI-powered query expansion, global location-based searching, and contact enrichment through Apollo API.

## Features

- **AI-Enhanced Search**: Intelligent query expansion using multiple LLM providers (OpenAI, Google Gemini, OpenRouter, Ollama)
- **Global Coverage**: Location-based search across multiple geographic regions
- **Contact Enrichment**: Integration with Apollo API for detailed contact information
- **Scalable Architecture**: Node.js-based server with async/await patterns
- **Robust Fallbacks**: Multiple API provider support with automatic failover
- **Rate Limiting**: Built-in protection against API rate limits
- **MCP Protocol Compliance**: Full compliance with Model Context Protocol specifications

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd search_mcp_server
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your API keys and configuration
```

4. Build the project:
```bash
npm run build
```

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example` and configure the following:

#### API Keys
- `GOOGLE_SEARCH_API_KEY`: Your Google Custom Search API key
- `GOOGLE_SEARCH_ENGINE_ID`: Your Google Custom Search Engine ID
- `APOLLO_API_KEY`: Your Apollo.io API key
- `OPENAI_API_KEY`: Your OpenAI API key (optional)
- `GOOGLE_GEMINI_API_KEY`: Your Google Gemini API key (optional)
- `OPENROUTER_API_KEY`: Your OpenRouter API key (optional)

#### Ollama Configuration (for local AI models)
- `OLLAMA_BASE_URL`: Ollama server URL (default: http://localhost:11434)
- `OLLAMA_MODEL`: Ollama model name (default: llama2)

#### Database Configuration
- `DATABASE_PATH`: SQLite database file path (default: ./data/search.db)

#### Search Configuration
- `DEFAULT_SEARCH_DELAY_MS`: Delay between searches in milliseconds (default: 120000)
- `MAX_SEARCH_RESULTS`: Maximum results per search (default: 100)
- `MAX_LOCATIONS_PER_SEARCH`: Maximum locations for global search (default: 50)
- `SEARCH_TIMEOUT_MS`: Search timeout in milliseconds (default: 30000)

#### Rate Limiting
- `GOOGLE_SEARCH_RATE_LIMIT`: Google Search API rate limit (default: 100)
- `APOLLO_RATE_LIMIT`: Apollo API rate limit (default: 1000)
- `AI_PROVIDER_RATE_LIMIT`: AI provider rate limit (default: 60)

#### Logging
- `LOG_LEVEL`: Logging level (default: info)
- `LOG_FILE`: Log file path (optional)
- `DISABLE_LOGGING`: Set to 'true' to disable all logging for clean JSON-RPC output
- `MCP_MODE`: Set to 'true' to enable MCP mode (disables logging for protocol compliance)

## Usage

### Starting the Server

```bash
# Development mode (with logging)
npm run dev

# Development mode (MCP - clean JSON-RPC)
npm run dev:mcp

# Production mode (with logging)
npm start

# Production mode (MCP - clean JSON-RPC)
npm run start:mcp
```

### MCP Protocol Compliance

This server is fully compliant with the Model Context Protocol (MCP) specification:

- **Clean JSON-RPC Output**: When `MCP_MODE=true` or `DISABLE_LOGGING=true`, all logs are redirected to stderr, ensuring clean JSON-RPC NDJSON output on stdout
- **Protocol Version**: Supports MCP protocol version 2024-11-05
- **Standard Methods**: Implements all required MCP methods (initialize, tools/list, tools/call)
- **Error Handling**: Proper JSON-RPC error responses with standard error codes

#### Running as MCP Server

To use this server with MCP clients, start it with logging disabled:

```bash
# Option 1: Using npm script (recommended)
npm run start:mcp

# Option 2: Using environment variable
MCP_MODE=true node dist/index.js

# Option 3: Using .env file
echo "MCP_MODE=true" >> .env
npm start
```

This ensures that stdout contains only JSON-RPC messages, which is required for MCP protocol compliance.

### MCP Tools

The server provides the following MCP tools:

#### 1. search_profiles
Search for LinkedIn profiles using keywords and optional location.

```json
{
  "query": "software engineer",
  "location": "San Francisco",
  "maxResults": 20,
  "enableQueryExpansion": true,
  "enableResultFiltering": true,
  "aiProvider": "openai"
}
```

#### 2. global_search_profiles
Perform a comprehensive search across multiple global locations with rate limiting.

```json
{
  "query": "data scientist",
  "maxLocations": 10,
  "delayBetweenSearches": 120000,
  "enableQueryExpansion": true,
  "enableResultFiltering": true,
  "enableContactEnrichment": false,
  "aiProvider": "openai",
  "relevanceThreshold": 0.7
}
```

#### 3. get_contact_info
Enrich contact information using Apollo API.

```json
{
  "name": "John Doe",
  "company": "Tech Corp",
  "email": "john@techcorp.com",
  "linkedinUrl": "https://linkedin.com/in/johndoe"
}
```

#### 4. get_search_progress
Monitor the progress of a running search operation.

```json
{
  "operationId": "uuid-of-operation"
}
```

#### 5. cancel_search
Cancel a running search operation.

```json
{
  "operationId": "uuid-of-operation"
}
```

#### 6. get_search_history
Retrieve historical search data.

```json
{
  "limit": 50,
  "operationId": "uuid-of-operation"
}
```

#### 7. export_results
Export search results in various formats.

```json
{
  "operationId": "uuid-of-operation",
  "format": "json",
  "includeEnrichment": true,
  "dateRange": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-12-31T23:59:59Z"
  }
}
```

#### 8. get_server_stats
Get server statistics and health information.

```json
{}
```

## Architecture

### Core Components

1. **Search Engines** (`src/search/engines.ts`)
   - Google Custom Search API integration
   - Fallback search mechanisms
   - Rate limiting and error handling

2. **AI Providers** (`src/ai/index.ts`)
   - Multi-provider support (OpenAI, Gemini, OpenRouter, Ollama)
   - Query expansion and result filtering
   - Automatic failover between providers

3. **Location Manager** (`src/locations/index.ts`)
   - Global location database
   - Location rotation and blacklisting
   - Success rate tracking

4. **Apollo Integration** (`src/apollo/index.ts`)
   - Contact enrichment
   - Person matching and data validation
   - Rate limiting compliance

5. **Search Orchestrator** (`src/search/orchestrator.ts`)
   - Coordinates all search operations
   - Manages long-running global searches
   - Progress tracking and state management

6. **Database** (`src/database/index.ts`)
   - SQLite-based data storage
   - Profile and search history management
   - Performance metrics tracking

### Data Flow

1. **Search Request** → Query validation and configuration
2. **Query Expansion** → AI-powered generation of additional search queries
3. **Location Selection** → Intelligent location rotation for global searches
4. **Search Execution** → Multiple search engines with fallback
5. **Result Filtering** → AI-powered relevance filtering
6. **Contact Enrichment** → Apollo API integration for additional data
7. **Data Storage** → Persistent storage of results and metadata
8. **Progress Tracking** → Real-time operation monitoring

## Development

### Project Structure

```
src/
├── ai/                 # AI provider integrations
├── apollo/             # Apollo API client
├── config/             # Configuration management
├── database/           # Database operations
├── locations/          # Location management
├── search/             # Search engines and orchestration
├── test/               # Test utilities
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
└── index.ts            # Main MCP server
```

### Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix
```

### Building

```bash
# Clean build directory
npm run clean

# Build TypeScript
npm run build

# Build and start
npm run prepare
```

### Docker Deployment

The project includes Docker configuration for containerized deployment:

#### Building Docker Image

```bash
# Build the Docker image
docker build -t search-mcp-server .

# Or use docker-compose
docker-compose build
```

#### Running with Docker

```bash
# Run in MCP mode (default)
docker-compose up

# Run in development mode with logging
docker-compose --profile dev up search-mcp-server-dev

# Run detached
docker-compose up -d
```

#### Docker Build Process

The Dockerfile uses a **multi-stage build** to fix the TypeScript compilation issue:

**Builder Stage:**
1. **Install ALL dependencies**: `npm ci --ignore-scripts` (includes devDependencies like TypeScript)
2. **Copy source files**: Copies `src/`, `tsconfig.json`, etc.
3. **Build TypeScript**: `npm run build` (tsc is now available from devDependencies)

**Production Stage:**
1. **Install production dependencies only**: `npm ci --ignore-scripts --only=production`
2. **Copy built files**: Copies compiled `dist/` from builder stage
3. **Run server**: Starts in MCP mode by default

This approach ensures:
- TypeScript compiler is available during build (from devDependencies)
- Final image only contains production dependencies (smaller size)
- Build process has access to source files before compilation

#### Environment Variables for Docker

Set these in your `docker-compose.yml` or pass via `-e` flags:

```yaml
environment:
  - MCP_MODE=true
  - GOOGLE_SEARCH_API_KEY=your_key
  - APOLLO_API_KEY=your_key
  - OPENAI_API_KEY=your_key
```

## API Integration

### Google Custom Search API

1. Create a Google Cloud Project
2. Enable the Custom Search API
3. Create a Custom Search Engine at https://cse.google.com/
4. Get your API key and Search Engine ID
5. Configure in `.env` file

### Apollo.io API

1. Sign up for Apollo.io account
2. Get your API key from the dashboard
3. Configure in `.env` file
4. Note: Apollo has monthly request limits

### AI Providers

#### OpenAI
1. Get API key from https://platform.openai.com/
2. Configure in `.env` file

#### Google Gemini
1. Get API key from Google AI Studio
2. Configure in `.env` file

#### OpenRouter
1. Get API key from https://openrouter.ai/
2. Configure in `.env` file

#### Ollama (Local)
1. Install Ollama locally
2. Pull desired models (e.g., `ollama pull llama2`)
3. Configure base URL in `.env` file

## Performance Considerations

### Rate Limiting

- Google Search API: 100 requests per day (configurable)
- Apollo API: 1000 requests per month (configurable)
- AI Providers: 60 requests per minute (configurable)

### Memory Usage

- SQLite database for efficient data storage
- Streaming for large result sets
- Connection pooling for database operations

### Scalability

- Horizontal scaling through multiple server instances
- Database partitioning for large datasets
- Load balancing for high availability

## Monitoring and Logging

### Logging Levels

- `error`: Error conditions
- `warn`: Warning conditions
- `info`: Informational messages
- `debug`: Debug-level messages

### Metrics

- Search operation success rates
- API response times
- Rate limit usage
- Database performance

### Health Checks

Use the `get_server_stats` tool to monitor:
- Active operations
- Database statistics
- API configuration status
- Memory usage
- Uptime

## Troubleshooting

### Common Issues

1. **API Rate Limits**
   - Increase delay between searches
   - Check API quotas and limits
   - Monitor rate limit logs

2. **Search Quality**
   - Adjust relevance thresholds
   - Enable/disable query expansion
   - Review AI provider responses

3. **Performance Issues**
   - Check database size and cleanup old records
   - Monitor memory usage
   - Optimize search parameters

4. **Configuration Errors**
   - Validate API keys and endpoints
   - Check environment variable setup
   - Review server logs for errors

### Debug Mode

Set `LOG_LEVEL=debug` in your `.env` file for detailed logging.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review server logs
3. Create an issue in the repository
4. Provide detailed error information and configuration

## Changelog

### Version 1.0.0
- Initial release
- Core search functionality
- AI-powered query expansion
- Global location support
- Apollo API integration
- MCP protocol compliance