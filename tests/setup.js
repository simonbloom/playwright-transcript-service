// Global test setup
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce noise during tests
process.env.CACHE_MAX_AGE = '1000'; // Short cache TTL for tests
process.env.CIRCUIT_BREAKER_TIMEOUT = '1000'; // Fast circuit breaker for tests

// Mock console methods to reduce test output noise
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging failed tests
  error: console.error
};

// Global test utilities
global.testUtils = {
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  mockYouTubeResponse: (videoId, transcript) => ({
    videoId,
    title: `Test Video ${videoId}`,
    transcript: transcript || [
      { text: 'Test transcript segment 1', start: 0, duration: 5 },
      { text: 'Test transcript segment 2', start: 5, duration: 5 }
    ]
  }),
  
  createMockRequest: (overrides = {}) => ({
    headers: { 'x-api-key': 'test-key' },
    body: { videoId: 'test123' },
    ...overrides
  }),
  
  createMockResponse: () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
    return res;
  }
};

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});