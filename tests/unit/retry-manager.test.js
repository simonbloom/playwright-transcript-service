const { RetryManager } = require('../../lib/retry-manager');

describe('RetryManager', () => {
  let retryManager;
  let mockOperation;
  
  beforeEach(() => {
    retryManager = new RetryManager({
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 1000,
      factor: 2,
      jitter: false, // Disable jitter for predictable tests
      budgetWindow: 5000,
      budgetMaxRetries: 5
    });
    mockOperation = jest.fn();
  });
  
  describe('Successful operations', () => {
    it('should execute operation successfully on first attempt', async () => {
      mockOperation.mockResolvedValue('success');
      
      const result = await retryManager.executeWithRetry(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(mockOperation).toHaveBeenCalledWith(0);
    });
    
    it('should retry and succeed after failures', async () => {
      mockOperation
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce('success');
      
      const result = await retryManager.executeWithRetry(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
      expect(mockOperation).toHaveBeenCalledWith(0);
      expect(mockOperation).toHaveBeenCalledWith(1);
      expect(mockOperation).toHaveBeenCalledWith(2);
    });
  });
  
  describe('Retry logic', () => {
    it('should respect max retries limit', async () => {
      mockOperation.mockRejectedValue(new Error('persistent error'));
      
      try {
        await retryManager.executeWithRetry(mockOperation);
        fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Operation failed after 3 retries');
      }
      
      expect(mockOperation).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });
    
    it('should not retry non-retryable errors', async () => {
      const nonRetryableErrors = [
        'Video not found',
        'Private video',
        'Removed video',
        'Transcript not available',
        'No captions available',
        'Invalid video ID',
        'Authentication failed',
        'Forbidden',
        'Unauthorized'
      ];
      
      for (const errorMessage of nonRetryableErrors) {
        mockOperation.mockClear();
        mockOperation.mockRejectedValue(new Error(errorMessage));
        
        await expect(retryManager.executeWithRetry(mockOperation))
          .rejects.toThrow(errorMessage);
        
        expect(mockOperation).toHaveBeenCalledTimes(1);
      }
    });
    
    it('should always retry network errors', async () => {
      const networkErrors = [
        'timeout',
        'Network error',
        'ECONNRESET',
        'ETIMEDOUT',
        'socket hang up',
        'Navigation failed',
        'Browser crashed',
        'Disconnected'
      ];
      
      for (const errorMessage of networkErrors) {
        mockOperation.mockClear();
        mockOperation
          .mockRejectedValueOnce(new Error(errorMessage))
          .mockResolvedValueOnce('success');
        
        const result = await retryManager.executeWithRetry(mockOperation);
        
        expect(result).toBe('success');
        expect(mockOperation).toHaveBeenCalledTimes(2);
      }
    });
  });
  
  describe('Exponential backoff', () => {
    it('should calculate delays with exponential backoff', () => {
      const delays = [];
      for (let i = 0; i < 4; i++) {
        delays.push(retryManager.calculateDelay(i, new Error('test')));
      }
      
      expect(delays[0]).toBe(100);  // baseDelay * 2^0
      expect(delays[1]).toBe(200);  // baseDelay * 2^1
      expect(delays[2]).toBe(400);  // baseDelay * 2^2
      expect(delays[3]).toBe(800);  // baseDelay * 2^3
    });
    
    it('should respect max delay limit', () => {
      const delay = retryManager.calculateDelay(10, new Error('test'));
      expect(delay).toBe(1000); // maxDelay
    });
    
    it('should add jitter when enabled', () => {
      const jitteredManager = new RetryManager({
        baseDelay: 1000,
        jitter: true
      });
      
      const delays = new Set();
      // Generate multiple delays to check for variation
      for (let i = 0; i < 10; i++) {
        delays.add(jitteredManager.calculateDelay(1, new Error('test')));
      }
      
      // With jitter, we should see different values
      expect(delays.size).toBeGreaterThan(1);
      
      // All values should be within 20% of base calculation (2000ms for attempt 1)
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(1600);
        expect(delay).toBeLessThanOrEqual(2400);
      });
    });
  });
  
  describe('Rate limiting handling', () => {
    it('should use longer delays for rate limit errors', () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.status = 429;
      
      const delay = retryManager.calculateDelay(0, rateLimitError);
      expect(delay).toBeGreaterThanOrEqual(5000);
    });
    
    it('should respect Retry-After header', () => {
      const rateLimitError = new Error('Rate limited');
      rateLimitError.status = 429;
      rateLimitError.headers = { 'retry-after': '10' };
      
      const delay = retryManager.calculateDelay(0, rateLimitError);
      expect(delay).toBe(10000); // 10 seconds
    });
  });
  
  describe('Retry budget', () => {
    it('should enforce retry budget limit', async () => {
      // Exhaust retry budget
      for (let i = 0; i < 5; i++) {
        retryManager.retryBudget.recordRetry();
      }
      
      mockOperation
        .mockRejectedValueOnce(new Error('error1'))
        .mockRejectedValueOnce(new Error('error2'));
      
      try {
        await retryManager.executeWithRetry(mockOperation);
        fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Retry budget exhausted');
      }
      
      // Should have stopped after first retry attempt
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });
    
    it('should clean up old retries from budget window', async () => {
      // Add old retries (outside window)
      retryManager.retryBudget.retries = [
        Date.now() - 6000, // Outside 5s window
        Date.now() - 7000,
        Date.now() - 1000  // Inside window
      ];
      
      expect(retryManager.retryBudget.canRetry()).toBe(true);
      expect(retryManager.retryBudget.retries).toHaveLength(1);
    });
  });
  
  describe('Error handling', () => {
    it('should preserve original error information', async () => {
      const originalError = new Error('Original failure');
      originalError.code = 'TEST_ERROR';
      mockOperation.mockRejectedValue(originalError);
      
      try {
        await retryManager.executeWithRetry(mockOperation);
      } catch (error) {
        expect(error.message).toContain('Operation failed after 3 retries');
        expect(error.originalError).toBe(originalError);
        expect(error.attempts).toBe(3);
      }
    });
    
    it('should handle HTTP status codes correctly', async () => {
      // Server errors should retry
      const serverError = new Error('Server error');
      serverError.status = 500;
      
      mockOperation
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce('success');
      
      const result = await retryManager.executeWithRetry(mockOperation);
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(2);
      
      // Client errors should not retry (except 429)
      mockOperation.mockClear();
      const clientError = new Error('Bad request');
      clientError.status = 400;
      
      mockOperation.mockRejectedValue(clientError);
      
      await expect(retryManager.executeWithRetry(mockOperation))
        .rejects.toThrow('Bad request');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('Statistics', () => {
    it('should provide retry budget statistics', () => {
      retryManager.retryBudget.recordRetry();
      retryManager.retryBudget.recordRetry();
      
      const stats = retryManager.getStats();
      
      expect(stats.retryBudget).toEqual({
        used: 2,
        available: 3,
        window: '5s'
      });
    });
  });
});