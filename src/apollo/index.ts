import axios, { AxiosResponse } from 'axios';
import { ApolloContact, ApolloSearchParams, ApolloAPIError } from '../types/index.js';
import { apolloConfig } from '../config/index.js';
import { createLogger, logAPICall, logError, logRateLimit } from '../utils/logger.js';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const logger = createLogger('apollo-api');

export class ApolloAPIClient {
  private config: typeof apolloConfig;
  private rateLimiter: RateLimiterMemory;

  constructor() {
    this.config = apolloConfig;
    
    // Rate limiter: Apollo typically allows 1000 requests per month
    this.rateLimiter = new RateLimiterMemory({
      points: 1000,
      duration: 2592000 // 30 days in seconds
    });

    logger.info('Apollo API client initialized', { 
      configured: this.isConfigured() 
    });
  }

  isConfigured(): boolean {
    return !!(this.config?.apiKey);
  }

  async searchPeople(params: ApolloSearchParams): Promise<ApolloContact[]> {
    if (!this.isConfigured()) {
      throw new ApolloAPIError('Apollo API not configured');
    }

    // Check rate limit
    try {
      await this.rateLimiter.consume('apollo-search');
    } catch (rateLimitError) {
      logRateLimit('apollo', 'search');
      throw new ApolloAPIError('Apollo API rate limit exceeded', 429);
    }

    const startTime = Date.now();

    try {
      const response: AxiosResponse = await axios.post(
        `${this.config!.baseUrl}/mixed_people/search`,
        this.buildSearchPayload(params),
        {
          headers: {
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/json',
            'X-Api-Key': this.config!.apiKey
          },
          timeout: 30000
        }
      );

      const duration = Date.now() - startTime;
      logAPICall('apollo', 'search', duration, true);

      const contacts = this.parseSearchResponse(response.data);
      
      logger.info('Apollo people search completed', {
        params,
        resultsCount: contacts.length,
        duration
      });

      return contacts;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const statusCode = axios.isAxiosError(error) ? error.response?.status : undefined;
      
      logAPICall('apollo', 'search', duration, false, errorMessage);
      logError(error as Error, { params });

      if (statusCode === 429) {
        logRateLimit('apollo', 'search');
      }

      throw new ApolloAPIError(
        `Apollo search failed: ${errorMessage}`,
        statusCode,
        error as Error
      );
    }
  }

  async getPersonByEmail(email: string): Promise<ApolloContact | null> {
    if (!this.isConfigured()) {
      throw new ApolloAPIError('Apollo API not configured');
    }

    // Check rate limit
    try {
      await this.rateLimiter.consume('apollo-enrich');
    } catch (rateLimitError) {
      logRateLimit('apollo', 'enrich');
      throw new ApolloAPIError('Apollo API rate limit exceeded', 429);
    }

    const startTime = Date.now();

    try {
      const response: AxiosResponse = await axios.post(
        `${this.config!.baseUrl}/people/match`,
        {
          email: email
        },
        {
          headers: {
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/json',
            'X-Api-Key': this.config!.apiKey
          },
          timeout: 30000
        }
      );

      const duration = Date.now() - startTime;
      logAPICall('apollo', 'enrich', duration, true);

      const contact = this.parsePersonResponse(response.data);
      
      logger.info('Apollo person enrichment completed', {
        email,
        found: !!contact,
        duration
      });

      return contact;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const statusCode = axios.isAxiosError(error) ? error.response?.status : undefined;
      
      logAPICall('apollo', 'enrich', duration, false, errorMessage);
      
      if (statusCode === 404) {
        // Person not found is not an error
        logger.info('Person not found in Apollo', { email });
        return null;
      }

      if (statusCode === 429) {
        logRateLimit('apollo', 'enrich');
      }

      logError(error as Error, { email });

      throw new ApolloAPIError(
        `Apollo enrichment failed: ${errorMessage}`,
        statusCode,
        error as Error
      );
    }
  }

  async enrichContact(name: string, company?: string, email?: string, linkedinUrl?: string): Promise<ApolloContact | null> {
    if (!this.isConfigured()) {
      throw new ApolloAPIError('Apollo API not configured');
    }

    // If we have an email, try direct lookup first
    if (email) {
      try {
        const contact = await this.getPersonByEmail(email);
        if (contact) return contact;
      } catch (error) {
        logger.warn('Direct email lookup failed, trying search', { email, error });
      }
    }

    // Try search by name and company
    const searchParams: ApolloSearchParams = {
      limit: 5
    };

    // Parse name into first and last name
    const nameParts = name.trim().split(' ');
    if (nameParts.length >= 2) {
      // Use the name as a search term in person titles or organization names
      searchParams.personTitles = [name];
    }

    if (company) {
      searchParams.organizationNames = [company];
    }

    try {
      const contacts = await this.searchPeople(searchParams);
      
      // Find best match
      const bestMatch = this.findBestMatch(contacts, name, company, email, linkedinUrl);
      
      if (bestMatch) {
        logger.info('Found matching contact via search', { 
          name, 
          company, 
          matchedName: bestMatch.name 
        });
      }

      return bestMatch;
    } catch (error) {
      logger.warn('Apollo search enrichment failed', { name, company, error });
      return null;
    }
  }

  private buildSearchPayload(params: ApolloSearchParams): any {
    const payload: any = {
      page: params.page || 1,
      per_page: Math.min(params.limit || 25, 100) // Apollo max is 100
    };

    if (params.personTitles && params.personTitles.length > 0) {
      payload.person_titles = params.personTitles;
    }

    if (params.organizationNames && params.organizationNames.length > 0) {
      payload.organization_names = params.organizationNames;
    }

    if (params.personLocations && params.personLocations.length > 0) {
      payload.person_locations = params.personLocations;
    }

    if (params.organizationLocations && params.organizationLocations.length > 0) {
      payload.organization_locations = params.organizationLocations;
    }

    if (params.personSeniorities && params.personSeniorities.length > 0) {
      payload.person_seniorities = params.personSeniorities;
    }

    if (params.contactEmailStatus && params.contactEmailStatus.length > 0) {
      payload.contact_email_status = params.contactEmailStatus;
    }

    return payload;
  }

  private parseSearchResponse(data: any): ApolloContact[] {
    if (!data.people || !Array.isArray(data.people)) {
      return [];
    }

    return data.people.map((person: any) => this.parsePersonData(person));
  }

  private parsePersonResponse(data: any): ApolloContact | null {
    if (!data.person) {
      return null;
    }

    return this.parsePersonData(data.person);
  }

  private parsePersonData(person: any): ApolloContact {
    const contact: ApolloContact = {
      id: person.id,
      firstName: person.first_name,
      lastName: person.last_name,
      name: person.name || `${person.first_name || ''} ${person.last_name || ''}`.trim(),
      title: person.title,
      email: person.email,
      phone: person.phone_numbers?.[0]?.sanitized_number,
      linkedinUrl: person.linkedin_url,
      twitterUrl: person.twitter_url,
      facebookUrl: person.facebook_url
    };

    // Parse organization data
    if (person.organization) {
      contact.organization = {
        name: person.organization.name,
        websiteUrl: person.organization.website_url,
        industry: person.organization.industry,
        size: person.organization.estimated_num_employees?.toString()
      };
      contact.company = person.organization.name;
    }

    return contact;
  }

  private findBestMatch(
    contacts: ApolloContact[], 
    targetName: string, 
    targetCompany?: string, 
    targetEmail?: string, 
    targetLinkedinUrl?: string
  ): ApolloContact | null {
    if (contacts.length === 0) return null;

    let bestMatch: ApolloContact | null = null;
    let bestScore = 0;

    for (const contact of contacts) {
      let score = 0;

      // Name matching (most important)
      if (contact.name) {
        const nameScore = this.calculateNameSimilarity(contact.name, targetName);
        score += nameScore * 0.5;
      }

      // Company matching
      if (targetCompany && contact.company) {
        const companyScore = this.calculateStringSimilarity(contact.company, targetCompany);
        score += companyScore * 0.3;
      }

      // Email matching (exact)
      if (targetEmail && contact.email && contact.email.toLowerCase() === targetEmail.toLowerCase()) {
        score += 0.4;
      }

      // LinkedIn URL matching (exact)
      if (targetLinkedinUrl && contact.linkedinUrl && contact.linkedinUrl === targetLinkedinUrl) {
        score += 0.3;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = contact;
      }
    }

    // Only return match if score is above threshold
    return bestScore > 0.6 ? bestMatch : null;
  }

  private calculateNameSimilarity(name1: string, name2: string): number {
    const normalize = (name: string) => name.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    const n1 = normalize(name1);
    const n2 = normalize(name2);

    // Exact match
    if (n1 === n2) return 1.0;

    // Check if all words in one name appear in the other
    const words1 = n1.split(/\s+/);
    const words2 = n2.split(/\s+/);

    const matches1 = words1.filter(word => words2.some(w => w.includes(word) || word.includes(w)));
    const matches2 = words2.filter(word => words1.some(w => w.includes(word) || word.includes(w)));

    const score1 = matches1.length / words1.length;
    const score2 = matches2.length / words2.length;

    return Math.max(score1, score2);
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const s1 = normalize(str1);
    const s2 = normalize(str2);

    if (s1 === s2) return 1.0;
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;

    // Simple word overlap
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    const overlap = words1.filter(word => words2.includes(word)).length;
    
    return overlap / Math.max(words1.length, words2.length);
  }

  async testConnection(): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      // Test with a minimal search
      await this.searchPeople({ limit: 1 });
      return true;
    } catch (error) {
      logger.error('Apollo API connection test failed', { error });
      return false;
    }
  }

  async getRemainingQuota(): Promise<number> {
    // This would require implementing Apollo's quota endpoint
    // For now, return estimated remaining based on rate limiter
    try {
      const res = await this.rateLimiter.get('apollo-search');
      return res ? res.remainingPoints : 1000;
    } catch {
      return 1000; // Default quota
    }
  }
}

// Export singleton instance
export const apolloClient = new ApolloAPIClient();