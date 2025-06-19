import { serverConfig, validateConfig } from './index';

describe('Config', () => {
  test('should load configuration', () => {
    expect(serverConfig).toBeDefined();
    expect(serverConfig.database).toBeDefined();
    expect(serverConfig.database.path).toBeDefined();
  });

  test('should have default values', () => {
    // In test environment, DATABASE_PATH is set to :memory:
    expect(serverConfig.database.path).toBe(':memory:');
    expect(serverConfig.search.maxResults).toBe(100);
    expect(serverConfig.search.defaultDelayMs).toBe(120000);
  });

  test('should validate configuration with proper database path', () => {
    // Temporarily override the database path for validation test
    const originalPath = serverConfig.database.path;
    serverConfig.database.path = './data/test.db';
    
    expect(() => validateConfig()).not.toThrow();
    
    // Restore original path
    serverConfig.database.path = originalPath;
  });
});