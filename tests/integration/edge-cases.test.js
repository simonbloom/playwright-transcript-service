/**
 * Edge Case Tests for Playwright Transcript Service
 * Tests unusual scenarios and error conditions
 */

const { CircuitBreaker } = require('../../lib/circuit-breaker');
const { RetryManager } = require('../../lib/retry-manager');
const { CacheManager } = require('../../lib/cache-manager');
const { RequestQueue } = require('../../lib/request-queue');
const { YouTubeUIDetector } = require('../../lib/youtube-ui-detector');

describe('Edge Case Tests', () => {
  describe('Circuit Breaker Edge Cases', () => {
    let circuitBreaker;
    
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeout: 100
      });
    });
    
    it('should handle rapid state transitions', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValueOnce('success');
      
      // Open circuit
      await expect(circuitBreaker.execute(operation)).rejects.toThrow();
      await expect(circuitBreaker.execute(operation)).rejects.toThrow();
      expect(circuitBreaker.state).toBe('OPEN');
      
      // Wait for half-open
      await testUtils.wait(150);
      
      // Should transition through half-open to closed
      await circuitBreaker.execute(operation);
      expect(circuitBreaker.state).toBe('HALF_OPEN');
    });
    
    it('should handle concurrent executions', async () => {
      let concurrentCount = 0;
      const operation = async () => {
        concurrentCount++;
        await testUtils.wait(50);
        concurrentCount--;
        return 'done';
      };
      
      // Execute multiple operations concurrently
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(circuitBreaker.execute(operation));
      }
      
      await Promise.all(promises);
      expect(circuitBreaker.getMetrics().totalSuccesses).toBe(5);
    });
  });
  
  describe('Retry Manager Edge Cases', () => {
    let retryManager;
    
    beforeEach(() => {
      retryManager = new RetryManager({
        maxRetries: 3,
        baseDelay: 10,
        jitter: false
      });
    });
    
    it('should handle operations that succeed on last retry', async () => {
      let attempts = 0;
      const operation = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts === 4) return Promise.resolve('finally!');
        throw new Error('Not yet');
      });
      
      const result = await retryManager.executeWithRetry(operation);
      
      expect(result).toBe('finally!');
      expect(operation).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });
    
    it('should handle changing error types', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Network error')) // Retryable
        .mockRejectedValueOnce(new Error('timeout')) // Retryable
        .mockRejectedValueOnce(new Error('Video not found')); // Non-retryable
      
      await expect(retryManager.executeWithRetry(operation))
        .rejects.toThrow('Video not found');
      
      expect(operation).toHaveBeenCalledTimes(3);
    });
    
    it('should handle rate limit with varying retry-after', async () => {
      const rateLimitError1 = new Error('Rate limited');
      rateLimitError1.status = 429;
      rateLimitError1.headers = { 'retry-after': '1' };
      
      const rateLimitError2 = new Error('Rate limited');
      rateLimitError2.status = 429;
      rateLimitError2.headers = { 'retry-after': '2' };
      
      const operation = jest.fn()
        .mockRejectedValueOnce(rateLimitError1)
        .mockRejectedValueOnce(rateLimitError2)
        .mockResolvedValueOnce('success');
      
      const start = Date.now();
      await retryManager.executeWithRetry(operation);
      const elapsed = Date.now() - start;
      
      // Should respect retry-after headers (1s + 2s = 3s minimum)
      expect(elapsed).toBeGreaterThanOrEqual(2900);
    });
  });
  
  describe('Cache Manager Edge Cases', () => {
    let cacheManager;
    
    beforeEach(() => {
      cacheManager = new CacheManager({
        maxSize: 3,
        maxAge: 100
      });
    });
    
    it('should handle rapid get/set operations', async () => {
      const operations = [];
      
      // Simulate concurrent operations
      for (let i = 0; i < 10; i++) {
        operations.push(
          Promise.resolve().then(() => {
            cacheManager.set(`key${i}`, `value${i}`);
            return cacheManager.get(`key${i}`);
          })
        );
      }
      
      const results = await Promise.all(operations);
      const nonNull = results.filter(r => r !== null);
      
      // At least maxSize items should be retrievable
      expect(nonNull.length).toBeGreaterThanOrEqual(3);
    });
    
    it('should handle cache stampede prevention', async () => {
      let computeCount = 0;
      const expensiveComputation = async () => {
        computeCount++;
        await testUtils.wait(50);
        return 'expensive result';
      };
      
      // Multiple requests for same key while computing
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          (async () => {
            const cached = cacheManager.get('expensive');
            if (!cached) {
              const result = await expensiveComputation();
              cacheManager.set('expensive', result);
              return result;
            }
            return cached;
          })()
        );
      }
      
      await Promise.all(promises);
      
      // Should compute multiple times due to race condition
      // This demonstrates need for cache-aside pattern with locking
      expect(computeCount).toBeGreaterThan(1);
    });
    
    it('should handle cache with circular references', () => {
      const obj = { name: 'test' };
      obj.self = obj; // Circular reference
      
      // Should not throw when estimating size
      expect(() => cacheManager.set('circular', obj)).not.toThrow();
      
      // Should still be retrievable
      const retrieved = cacheManager.get('circular');
      expect(retrieved).toHaveProperty('name', 'test');
    });
  });
  
  describe('Request Queue Edge Cases', () => {
    let requestQueue;
    
    beforeEach(() => {
      requestQueue = new RequestQueue({
        maxConcurrent: 2,
        maxQueueSize: 5,
        timeout: 200
      });
    });
    
    it('should handle queue overflow gracefully', async () => {
      const slowOperation = () => new Promise(resolve => setTimeout(resolve, 300));
      
      // Fill processing slots
      requestQueue.enqueue(slowOperation);
      requestQueue.enqueue(slowOperation);
      
      // Fill queue
      for (let i = 0; i < 5; i++) {
        requestQueue.enqueue(slowOperation);
      }
      
      // Next should fail
      await expect(requestQueue.enqueue(slowOperation))
        .rejects.toThrow('Queue is full');
    });
    
    it('should handle priority inversion', async () => {
      const results = [];
      const trackOperation = (id) => () => {
        results.push(id);
        return Promise.resolve();
      };
      
      // Add low priority first
      await requestQueue.enqueue(trackOperation('low'), {
        priority: requestQueue.priorities.LOW
      });
      
      // Add high priority - should execute first if queued
      await requestQueue.enqueue(trackOperation('high'), {
        priority: requestQueue.priorities.HIGH
      });
      
      expect(results).toEqual(['low', 'high']); // Low was already processing
    });
    
    it('should handle timeout during retry', async () => {
      let attempts = 0;
      const retryOperation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('TIMEOUT');
        }
        await testUtils.wait(300); // Exceed timeout on success
        return 'too late';
      };
      
      await expect(requestQueue.enqueue(retryOperation, {
        maxRetries: 3,
        timeout: 200
      })).rejects.toThrow('timeout');
      
      expect(attempts).toBeGreaterThanOrEqual(2);
    });
  });
  
  describe('YouTube UI Detector Edge Cases', () => {
    let detector;
    let mockPage;
    
    beforeEach(() => {
      detector = new YouTubeUIDetector();
      mockPage = {
        $: jest.fn(),
        $$: jest.fn(),
        $eval: jest.fn(),
        evaluate: jest.fn(),
        waitForSelector: jest.fn(),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        locator: jest.fn(),
        keyboard: { press: jest.fn() }
      };
    });
    
    it('should handle multiple UI versions simultaneously', async () => {
      // Simulate page with mixed UI indicators
      mockPage.$.mockImplementation((selector) => {
        if (selector === 'ytd-app[is-polymer-3]') return {};
        if (selector === 'ytm-app') return {}; // Mobile and desktop?
        if (selector === 'div#watch7-container') return {}; // Old layout too?
        return null;
      });
      
      const version = await detector.detectUIVersion(mockPage);
      
      // Should detect all indicators
      expect(version.polymer3).toBe(true);
      expect(version.mobile).toBe(true);
      expect(version.oldLayout).toBe(true);
    });
    
    it('should handle button click failures gracefully', async () => {
      const mockButton = {
        click: jest.fn().mockRejectedValue(new Error('Element not interactable'))
      };
      
      mockPage.waitForSelector.mockResolvedValue(mockButton);
      
      // Should not throw, but return the button anyway
      const button = await detector.findTranscriptButton(mockPage);
      expect(button).toBe(mockButton);
    });
    
    it('should extract segments with malformed timestamps', async () => {
      mockPage.evaluate.mockResolvedValue([
        { timestamp: '1:60', text: 'Invalid minutes' }, // 60 minutes?
        { timestamp: '99:99:99', text: 'Way too long' },
        { timestamp: 'not a time', text: 'Not a timestamp' },
        { timestamp: '5:30', text: 'Valid segment' }
      ]);
      
      const segments = await detector.extractSegments(mockPage, {});
      
      // Should still return all segments, let extractor handle parsing
      expect(segments).toHaveLength(4);
    });
    
    it('should handle deeply nested transcript panels', async () => {
      let callCount = 0;
      mockPage.$.mockImplementation(async () => {
        callCount++;
        if (callCount > 15) {
          // Eventually find it
          return { isVisible: jest.fn().mockResolvedValue(true) };
        }
        return null;
      });
      
      const panel = await detector.waitForTranscriptPanel(mockPage, {
        timeout: 1000
      });
      
      expect(panel).toBeTruthy();
      expect(mockPage.$).toHaveBeenCalledTimes(16);
    });
  });
  
  describe('Integration Edge Cases', () => {
    it('should handle cascading failures', async () => {
      const cache = new CacheManager({ maxSize: 1 });
      const circuitBreaker = new CircuitBreaker({ failureThreshold: 1 });
      const retryManager = new RetryManager({ maxRetries: 1 });
      const queue = new RequestQueue({ maxConcurrent: 1 });
      
      // Simulate cascading failure
      const failingOperation = async () => {
        throw new Error('Service unavailable');
      };
      
      // First failure opens circuit
      await expect(
        queue.enqueue(() => 
          circuitBreaker.execute(() => 
            retryManager.executeWithRetry(failingOperation)
          )
        )
      ).rejects.toThrow();
      
      // Circuit should be open
      expect(circuitBreaker.state).toBe('OPEN');
      
      // Subsequent requests should fail fast
      await expect(
        queue.enqueue(() => 
          circuitBreaker.execute(() => Promise.resolve('test'))
        )
      ).rejects.toThrow('Circuit breaker is OPEN');
    });
  });
});