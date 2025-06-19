import { Location, LocationQueue } from '../types/index.js';
import { database } from '../database/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('locations');

export class LocationManager {
  private locationQueue: LocationQueue;
  private initialized = false;

  constructor() {
    this.locationQueue = {
      locations: [],
      currentIndex: 0,
      blacklistedLocations: new Set()
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load locations from database
    const locations = await database.getLocations(true);
    
    if (locations.length === 0) {
      // Initialize with default locations if none exist
      await this.initializeDefaultLocations();
      this.locationQueue.locations = await database.getLocations(true);
    } else {
      this.locationQueue.locations = locations;
    }

    // Sort by priority and success rate
    this.locationQueue.locations.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return b.successRate - a.successRate; // Higher success rate first
    });

    this.initialized = true;
    logger.info('Location manager initialized', { 
      totalLocations: this.locationQueue.locations.length 
    });
  }

  private async initializeDefaultLocations(): Promise<void> {
    const defaultLocations: Omit<Location, 'id'>[] = [
      // Major English-speaking countries
      { name: 'United States', country: 'United States', countryCode: 'US', searchCode: 'US', priority: 10, isActive: true, successRate: 0 },
      { name: 'United Kingdom', country: 'United Kingdom', countryCode: 'GB', searchCode: 'GB', priority: 9, isActive: true, successRate: 0 },
      { name: 'Canada', country: 'Canada', countryCode: 'CA', searchCode: 'CA', priority: 9, isActive: true, successRate: 0 },
      { name: 'Australia', country: 'Australia', countryCode: 'AU', searchCode: 'AU', priority: 8, isActive: true, successRate: 0 },
      
      // Major European countries
      { name: 'Germany', country: 'Germany', countryCode: 'DE', searchCode: 'DE', priority: 8, isActive: true, successRate: 0 },
      { name: 'France', country: 'France', countryCode: 'FR', searchCode: 'FR', priority: 7, isActive: true, successRate: 0 },
      { name: 'Netherlands', country: 'Netherlands', countryCode: 'NL', searchCode: 'NL', priority: 7, isActive: true, successRate: 0 },
      { name: 'Switzerland', country: 'Switzerland', countryCode: 'CH', searchCode: 'CH', priority: 7, isActive: true, successRate: 0 },
      { name: 'Sweden', country: 'Sweden', countryCode: 'SE', searchCode: 'SE', priority: 6, isActive: true, successRate: 0 },
      { name: 'Denmark', country: 'Denmark', countryCode: 'DK', searchCode: 'DK', priority: 6, isActive: true, successRate: 0 },
      
      // Major Asian countries
      { name: 'Singapore', country: 'Singapore', countryCode: 'SG', searchCode: 'SG', priority: 8, isActive: true, successRate: 0 },
      { name: 'Hong Kong', country: 'Hong Kong', countryCode: 'HK', searchCode: 'HK', priority: 7, isActive: true, successRate: 0 },
      { name: 'Japan', country: 'Japan', countryCode: 'JP', searchCode: 'JP', priority: 6, isActive: true, successRate: 0 },
      { name: 'India', country: 'India', countryCode: 'IN', searchCode: 'IN', priority: 6, isActive: true, successRate: 0 },
      
      // Major US cities
      { name: 'New York', country: 'United States', countryCode: 'US', city: 'New York', searchCode: 'New York, NY, US', priority: 9, isActive: true, successRate: 0 },
      { name: 'San Francisco', country: 'United States', countryCode: 'US', city: 'San Francisco', searchCode: 'San Francisco, CA, US', priority: 9, isActive: true, successRate: 0 },
      { name: 'Los Angeles', country: 'United States', countryCode: 'US', city: 'Los Angeles', searchCode: 'Los Angeles, CA, US', priority: 8, isActive: true, successRate: 0 },
      { name: 'Chicago', country: 'United States', countryCode: 'US', city: 'Chicago', searchCode: 'Chicago, IL, US', priority: 7, isActive: true, successRate: 0 },
      { name: 'Boston', country: 'United States', countryCode: 'US', city: 'Boston', searchCode: 'Boston, MA, US', priority: 7, isActive: true, successRate: 0 },
      { name: 'Seattle', country: 'United States', countryCode: 'US', city: 'Seattle', searchCode: 'Seattle, WA, US', priority: 7, isActive: true, successRate: 0 },
      
      // Major European cities
      { name: 'London', country: 'United Kingdom', countryCode: 'GB', city: 'London', searchCode: 'London, GB', priority: 9, isActive: true, successRate: 0 },
      { name: 'Berlin', country: 'Germany', countryCode: 'DE', city: 'Berlin', searchCode: 'Berlin, DE', priority: 7, isActive: true, successRate: 0 },
      { name: 'Paris', country: 'France', countryCode: 'FR', city: 'Paris', searchCode: 'Paris, FR', priority: 7, isActive: true, successRate: 0 },
      { name: 'Amsterdam', country: 'Netherlands', countryCode: 'NL', city: 'Amsterdam', searchCode: 'Amsterdam, NL', priority: 6, isActive: true, successRate: 0 },
      { name: 'Zurich', country: 'Switzerland', countryCode: 'CH', city: 'Zurich', searchCode: 'Zurich, CH', priority: 6, isActive: true, successRate: 0 },
      
      // Major Canadian cities
      { name: 'Toronto', country: 'Canada', countryCode: 'CA', city: 'Toronto', searchCode: 'Toronto, ON, CA', priority: 8, isActive: true, successRate: 0 },
      { name: 'Vancouver', country: 'Canada', countryCode: 'CA', city: 'Vancouver', searchCode: 'Vancouver, BC, CA', priority: 7, isActive: true, successRate: 0 },
      
      // Major Australian cities
      { name: 'Sydney', country: 'Australia', countryCode: 'AU', city: 'Sydney', searchCode: 'Sydney, AU', priority: 7, isActive: true, successRate: 0 },
      { name: 'Melbourne', country: 'Australia', countryCode: 'AU', city: 'Melbourne', searchCode: 'Melbourne, AU', priority: 6, isActive: true, successRate: 0 }
    ];

    for (const location of defaultLocations) {
      await database.insertLocation(location);
    }

    logger.info('Default locations initialized', { count: defaultLocations.length });
  }

  async getNextLocation(): Promise<Location | null> {
    await this.initialize();

    if (this.locationQueue.locations.length === 0) {
      logger.warn('No locations available');
      return null;
    }

    // Find next non-blacklisted location
    let attempts = 0;
    while (attempts < this.locationQueue.locations.length) {
      const location = this.locationQueue.locations[this.locationQueue.currentIndex];
      
      if (location && !this.locationQueue.blacklistedLocations.has(location.id)) {
        // Move to next location for next call
        this.locationQueue.currentIndex = (this.locationQueue.currentIndex + 1) % this.locationQueue.locations.length;
        
        logger.info('Selected location for search', {
          location: location.name,
          country: location.country,
          priority: location.priority,
          successRate: location.successRate
        });
        
        return location;
      }

      this.locationQueue.currentIndex = (this.locationQueue.currentIndex + 1) % this.locationQueue.locations.length;
      attempts++;
    }

    logger.warn('All locations are blacklisted');
    return null;
  }

  async getLocations(maxCount?: number): Promise<Location[]> {
    await this.initialize();

    let locations = this.locationQueue.locations.filter(
      loc => !this.locationQueue.blacklistedLocations.has(loc.id)
    );

    if (maxCount && maxCount > 0) {
      locations = locations.slice(0, maxCount);
    }

    return locations;
  }

  blacklistLocation(locationId: string, duration = 3600000): void { // Default 1 hour
    this.locationQueue.blacklistedLocations.add(locationId);
    
    // Remove from blacklist after duration
    setTimeout(() => {
      this.locationQueue.blacklistedLocations.delete(locationId);
      logger.info('Location removed from blacklist', { locationId });
    }, duration);

    logger.info('Location blacklisted', { locationId, duration });
  }

  async updateLocationSuccess(locationId: string, success: boolean): Promise<void> {
    await database.updateLocationStats(locationId, success);
    
    // Reload locations to get updated success rates
    this.locationQueue.locations = await database.getLocations(true);
    
    // Re-sort by priority and success rate
    this.locationQueue.locations.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return b.successRate - a.successRate;
    });

    logger.info('Location success updated', { locationId, success });
  }

  async addCustomLocation(location: Omit<Location, 'id'>): Promise<string> {
    const id = await database.insertLocation(location);
    
    // Reload locations
    await this.initialize();
    
    logger.info('Custom location added', { id, name: location.name });
    return id;
  }

  async removeLocation(locationId: string): Promise<void> {
    // Note: This would require implementing a delete method in the database
    // For now, we'll just deactivate the location
    this.locationQueue.locations = this.locationQueue.locations.map(loc => 
      loc.id === locationId ? { ...loc, isActive: false } : loc
    );

    // Remove from blacklist if present
    this.locationQueue.blacklistedLocations.delete(locationId);

    logger.info('Location deactivated', { locationId });
  }

  getLocationStats(): {
    total: number;
    active: number;
    blacklisted: number;
    avgSuccessRate: number;
  } {
    const total = this.locationQueue.locations.length;
    const active = this.locationQueue.locations.filter(loc => loc.isActive).length;
    const blacklisted = this.locationQueue.blacklistedLocations.size;
    const avgSuccessRate = this.locationQueue.locations.reduce((sum, loc) => sum + loc.successRate, 0) / total;

    return {
      total,
      active,
      blacklisted,
      avgSuccessRate: isNaN(avgSuccessRate) ? 0 : avgSuccessRate
    };
  }

  clearBlacklist(): void {
    this.locationQueue.blacklistedLocations.clear();
    logger.info('Location blacklist cleared');
  }

  reset(): void {
    this.locationQueue.currentIndex = 0;
    this.clearBlacklist();
    logger.info('Location manager reset');
  }
}

// Export singleton instance
export const locationManager = new LocationManager();