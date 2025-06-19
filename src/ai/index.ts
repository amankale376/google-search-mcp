import axios, { AxiosResponse } from 'axios';
import { AIProvider, QueryExpansionRequest, QueryExpansionResponse, ResultFilterRequest, ResultFilterResponse, AIProviderError } from '../types/index.js';
import { getAIProvider, getAvailableAIProviders, getDefaultAIProvider } from '../config/index.js';
import { createLogger, logAPICall, logError } from '../utils/logger.js';

const logger = createLogger('ai-providers');

export class AIProviderManager {
  private providers: Map<string, AIProvider> = new Map();

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    const availableProviders = getAvailableAIProviders();
    
    for (const providerName of availableProviders) {
      const provider = getAIProvider(providerName);
      if (provider) {
        this.providers.set(providerName, provider);
        logger.info('AI provider initialized', { provider: providerName });
      }
    }
  }

  async expandQuery(request: QueryExpansionRequest, providerName?: string): Promise<QueryExpansionResponse> {
    const provider = this.getProvider(providerName);
    const startTime = Date.now();

    try {
      let response: QueryExpansionResponse;

      switch (provider.name) {
        case 'openai':
          response = await this.expandQueryOpenAI(request, provider);
          break;
        case 'gemini':
          response = await this.expandQueryGemini(request, provider);
          break;
        case 'openrouter':
          response = await this.expandQueryOpenRouter(request, provider);
          break;
        case 'ollama':
          response = await this.expandQueryOllama(request, provider);
          break;
        default:
          throw new AIProviderError(`Unsupported AI provider: ${provider.name}`, provider.name);
      }

      const duration = Date.now() - startTime;
      logAPICall(provider.name, 'query-expansion', duration, true);

      logger.info('Query expansion completed', {
        provider: provider.name,
        originalQuery: request.originalQuery,
        expandedCount: response.expandedQueries.length,
        confidence: response.confidence
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logAPICall(provider.name, 'query-expansion', duration, false, errorMessage);
      logError(error as Error, { provider: provider.name, request });

      throw new AIProviderError(
        `Query expansion failed: ${errorMessage}`,
        provider.name,
        undefined,
        error as Error
      );
    }
  }

  async filterResults(request: ResultFilterRequest, providerName?: string): Promise<ResultFilterResponse> {
    const provider = this.getProvider(providerName);
    const startTime = Date.now();

    try {
      let response: ResultFilterResponse;

      switch (provider.name) {
        case 'openai':
          response = await this.filterResultsOpenAI(request, provider);
          break;
        case 'gemini':
          response = await this.filterResultsGemini(request, provider);
          break;
        case 'openrouter':
          response = await this.filterResultsOpenRouter(request, provider);
          break;
        case 'ollama':
          response = await this.filterResultsOllama(request, provider);
          break;
        default:
          throw new AIProviderError(`Unsupported AI provider: ${provider.name}`, provider.name);
      }

      const duration = Date.now() - startTime;
      logAPICall(provider.name, 'result-filtering', duration, true);

      logger.info('Result filtering completed', {
        provider: provider.name,
        originalCount: request.results.length,
        filteredCount: response.filteredResults.length,
        removedCount: response.removedCount
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logAPICall(provider.name, 'result-filtering', duration, false, errorMessage);
      logError(error as Error, { provider: provider.name, request });

      throw new AIProviderError(
        `Result filtering failed: ${errorMessage}`,
        provider.name,
        undefined,
        error as Error
      );
    }
  }

  private getProvider(providerName?: string): AIProvider {
    const name = providerName || getDefaultAIProvider();
    
    if (!name) {
      throw new AIProviderError('No AI provider available', 'none');
    }

    const provider = this.providers.get(name);
    if (!provider) {
      throw new AIProviderError(`AI provider not found: ${name}`, name);
    }

    return provider;
  }

  // OpenAI implementation
  private async expandQueryOpenAI(request: QueryExpansionRequest, provider: AIProvider): Promise<QueryExpansionResponse> {
    const prompt = this.buildQueryExpansionPrompt(request);
    
    const response: AxiosResponse = await axios.post(
      `${provider.baseUrl}/chat/completions`,
      {
        model: provider.model || 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at generating search queries for LinkedIn profile mining. Generate diverse, relevant search queries that will help find professional profiles.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: provider.maxTokens || 2000,
        temperature: provider.temperature || 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    return this.parseQueryExpansionResponse(response.data.choices[0].message.content);
  }

  private async expandQueryGemini(request: QueryExpansionRequest, provider: AIProvider): Promise<QueryExpansionResponse> {
    const prompt = this.buildQueryExpansionPrompt(request);
    
    const response: AxiosResponse = await axios.post(
      `${provider.baseUrl}/models/${provider.model || 'gemini-pro'}:generateContent`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          maxOutputTokens: provider.maxTokens || 2000,
          temperature: provider.temperature || 0.7
        }
      },
      {
        headers: {
          'x-goog-api-key': provider.apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const content = response.data.candidates[0].content.parts[0].text;
    return this.parseQueryExpansionResponse(content);
  }

  private async expandQueryOpenRouter(request: QueryExpansionRequest, provider: AIProvider): Promise<QueryExpansionResponse> {
    const prompt = this.buildQueryExpansionPrompt(request);
    
    const response: AxiosResponse = await axios.post(
      `${provider.baseUrl}/chat/completions`,
      {
        model: provider.model || 'anthropic/claude-3-sonnet',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at generating search queries for LinkedIn profile mining. Generate diverse, relevant search queries that will help find professional profiles.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: provider.maxTokens || 2000,
        temperature: provider.temperature || 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    return this.parseQueryExpansionResponse(response.data.choices[0].message.content);
  }

  private async expandQueryOllama(request: QueryExpansionRequest, provider: AIProvider): Promise<QueryExpansionResponse> {
    const prompt = this.buildQueryExpansionPrompt(request);
    
    const response: AxiosResponse = await axios.post(
      `${provider.baseUrl}/api/generate`,
      {
        model: provider.model || 'llama2',
        prompt: prompt,
        stream: false,
        options: {
          temperature: provider.temperature || 0.7,
          num_predict: provider.maxTokens || 2000
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 60000 // Ollama can be slower
      }
    );

    return this.parseQueryExpansionResponse(response.data.response);
  }

  // Result filtering implementations
  private async filterResultsOpenAI(request: ResultFilterRequest, provider: AIProvider): Promise<ResultFilterResponse> {
    const prompt = this.buildResultFilterPrompt(request);
    
    const response: AxiosResponse = await axios.post(
      `${provider.baseUrl}/chat/completions`,
      {
        model: provider.model || 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at filtering search results for relevance to LinkedIn profile mining queries. Analyze each result and determine if it\'s relevant to finding professional profiles.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: provider.maxTokens || 2000,
        temperature: 0.3 // Lower temperature for more consistent filtering
      },
      {
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    return this.parseResultFilterResponse(response.data.choices[0].message.content, request.results);
  }

  private async filterResultsGemini(request: ResultFilterRequest, provider: AIProvider): Promise<ResultFilterResponse> {
    const prompt = this.buildResultFilterPrompt(request);
    
    const response: AxiosResponse = await axios.post(
      `${provider.baseUrl}/models/${provider.model || 'gemini-pro'}:generateContent`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          maxOutputTokens: provider.maxTokens || 2000,
          temperature: 0.3
        }
      },
      {
        headers: {
          'x-goog-api-key': provider.apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const content = response.data.candidates[0].content.parts[0].text;
    return this.parseResultFilterResponse(content, request.results);
  }

  private async filterResultsOpenRouter(request: ResultFilterRequest, provider: AIProvider): Promise<ResultFilterResponse> {
    const prompt = this.buildResultFilterPrompt(request);
    
    const response: AxiosResponse = await axios.post(
      `${provider.baseUrl}/chat/completions`,
      {
        model: provider.model || 'anthropic/claude-3-sonnet',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at filtering search results for relevance to LinkedIn profile mining queries. Analyze each result and determine if it\'s relevant to finding professional profiles.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: provider.maxTokens || 2000,
        temperature: 0.3
      },
      {
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    return this.parseResultFilterResponse(response.data.choices[0].message.content, request.results);
  }

  private async filterResultsOllama(request: ResultFilterRequest, provider: AIProvider): Promise<ResultFilterResponse> {
    const prompt = this.buildResultFilterPrompt(request);
    
    const response: AxiosResponse = await axios.post(
      `${provider.baseUrl}/api/generate`,
      {
        model: provider.model || 'llama2',
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: provider.maxTokens || 2000
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    return this.parseResultFilterResponse(response.data.response, request.results);
  }

  // Helper methods
  private buildQueryExpansionPrompt(request: QueryExpansionRequest): string {
    const maxQueries = request.maxQueries || 10;
    const location = request.location ? ` in ${request.location}` : '';
    const context = request.context ? `\n\nAdditional context: ${request.context}` : '';

    return `Generate ${maxQueries} diverse search queries to find LinkedIn profiles related to: "${request.originalQuery}"${location}

The queries should:
1. Use different keyword combinations and synonyms
2. Include job titles, company names, and industry terms
3. Be specific enough to find relevant profiles
4. Vary in approach (broad vs specific, different angles)
5. Include location-specific variations if a location is specified${context}

Return the result as a JSON object with this structure:
{
  "expandedQueries": ["query1", "query2", ...],
  "confidence": 0.8,
  "reasoning": "Brief explanation of the approach"
}`;
  }

  private buildResultFilterPrompt(request: ResultFilterRequest): string {
    const threshold = request.relevanceThreshold || 0.7;
    const resultsText = request.results.map((result, index) => 
      `${index}: ${result.title} - ${result.snippet} (${result.url})`
    ).join('\n');

    return `Filter these search results for relevance to the query: "${request.originalQuery}"

Results to filter:
${resultsText}

Keep only results that:
1. Are likely to contain LinkedIn profiles or professional information
2. Match the search intent with confidence >= ${threshold}
3. Are not spam, ads, or irrelevant content

Return the result as a JSON object with this structure:
{
  "relevantIndices": [0, 2, 5, ...],
  "reasoning": "Brief explanation of filtering decisions"
}`;
  }

  private parseQueryExpansionResponse(content: string): QueryExpansionResponse {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          expandedQueries: parsed.expandedQueries || [],
          confidence: parsed.confidence || 0.5,
          reasoning: parsed.reasoning
        };
      }

      // Fallback: extract queries from text
      const lines = content.split('\n').filter(line => line.trim());
      const queries = lines
        .filter(line => line.match(/^\d+\.|\-|\*/) || line.includes('"'))
        .map(line => line.replace(/^\d+\.\s*|\-\s*|\*\s*|"/g, '').trim())
        .filter(query => query.length > 0);

      return {
        expandedQueries: queries,
        confidence: 0.6,
        reasoning: 'Parsed from text format'
      };
    } catch (error) {
      logger.warn('Failed to parse query expansion response', { content, error });
      return {
        expandedQueries: [],
        confidence: 0,
        reasoning: 'Failed to parse response'
      };
    }
  }

  private parseResultFilterResponse(content: string, originalResults: any[]): ResultFilterResponse {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const relevantIndices = parsed.relevantIndices || [];
        const filteredResults = relevantIndices
          .filter((index: number) => index >= 0 && index < originalResults.length)
          .map((index: number) => originalResults[index]);

        return {
          filteredResults,
          removedCount: originalResults.length - filteredResults.length,
          reasoning: parsed.reasoning
        };
      }

      // Fallback: return all results if parsing fails
      return {
        filteredResults: originalResults,
        removedCount: 0,
        reasoning: 'Failed to parse filter response, returned all results'
      };
    } catch (error) {
      logger.warn('Failed to parse result filter response', { content, error });
      return {
        filteredResults: originalResults,
        removedCount: 0,
        reasoning: 'Failed to parse response, returned all results'
      };
    }
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  isProviderAvailable(providerName: string): boolean {
    return this.providers.has(providerName);
  }
}

// Export singleton instance
export const aiProviderManager = new AIProviderManager();