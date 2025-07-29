const { RequestQueue } = require('../../lib/request-queue');

describe('RequestQueue', () => {
  let requestQueue;
  let mockCallback;
  
  beforeEach(() => {
    requestQueue = new RequestQueue({
      maxConcurrent: 2,
      maxQueueSize: 10,
      timeout: 1000,
      rateLimitWindow: 1000,
      rateLimitMax: 5
    });
    mockCallback = jest.fn();
  });
  
  describe('Queue management', () => {
    it('should enqueue and process requests', async () => {
      mockCallback.mockResolvedValue('result');
      
      const result = await requestQueue.enqueue('request1', {
        callback: mockCallback
      });
      
      expect(result).toBe('result');
      expect(mockCallback).toHaveBeenCalledWith('request1');
      expect(requestQueue.getStats().completed).toBe(1);
    });
    
    it('should handle function requests', async () => {
      const requestFn = jest.fn().mockResolvedValue('function result');
      
      const result = await requestQueue.enqueue(requestFn);
      
      expect(result).toBe('function result');
      expect(requestFn).toHaveBeenCalled();
    });
    
    it('should reject when queue is full', async () => {
      // Fill queue to capacity
      const slowCallback = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('slow'), 2000))
      );
      
      // Fill processing slots
      requestQueue.enqueue('p1', { callback: slowCallback });
      requestQueue.enqueue('p2', { callback: slowCallback });
      
      // Fill queue
      for (let i = 0; i < 10; i++) {
        requestQueue.enqueue(`q${i}`, { callback: slowCallback });
      }
      
      // Should reject next request
      await expect(requestQueue.enqueue('overflow', { callback: mockCallback }))
        .rejects.toThrow('Queue is full');
    });
  });
  
  describe('Priority handling', () => {
    it('should process high priority requests first', async () => {
      const results = [];
      const trackingCallback = (req) => {
        results.push(req);
        return Promise.resolve(req);
      };
      
      // Block processing slots
      const blocker = new Promise(resolve => setTimeout(resolve, 100));
      requestQueue.enqueue(() => blocker);
      requestQueue.enqueue(() => blocker);
      
      // Add requests with different priorities
      requestQueue.enqueue('low1', {
        callback: trackingCallback,
        priority: requestQueue.priorities.LOW
      });
      requestQueue.enqueue('normal1', {
        callback: trackingCallback,
        priority: requestQueue.priorities.NORMAL
      });
      requestQueue.enqueue('high1', {
        callback: trackingCallback,
        priority: requestQueue.priorities.HIGH
      });
      requestQueue.enqueue('low2', {
        callback: trackingCallback,
        priority: requestQueue.priorities.LOW
      });
      
      // Wait for processing
      await testUtils.wait(200);
      
      // High priority should be processed first after blockers
      expect(results[0]).toBe('high1');
      expect(results[1]).toBe('normal1');
    });
    
    it('should maintain FIFO order within same priority', async () => {
      const results = [];
      const trackingCallback = (req) => {
        results.push(req);
        return Promise.resolve(req);
      };
      
      // Add multiple normal priority requests
      await requestQueue.enqueue('normal1', { callback: trackingCallback });
      await requestQueue.enqueue('normal2', { callback: trackingCallback });
      await requestQueue.enqueue('normal3', { callback: trackingCallback });
      
      expect(results).toEqual(['normal1', 'normal2', 'normal3']);
    });
  });
  
  describe('Concurrency control', () => {
    it('should limit concurrent processing', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;
      
      const concurrencyTracker = async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await testUtils.wait(50);
        concurrent--;
        return 'done';
      };
      
      // Start 5 requests
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(requestQueue.enqueue(concurrencyTracker));
      }
      
      await Promise.all(promises);
      
      expect(maxConcurrent).toBe(2); // Should never exceed maxConcurrent
    });
  });
  
  describe('Rate limiting', () => {
    it('should enforce rate limits', async () => {
      mockCallback.mockResolvedValue('ok');
      
      // Process requests up to rate limit
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(requestQueue.enqueue(`req${i}`, { callback: mockCallback }));
      }
      
      await Promise.all(promises);
      expect(mockCallback).toHaveBeenCalledTimes(5);
      
      // Next request should be delayed
      mockCallback.mockClear();
      const start = Date.now();
      
      await requestQueue.enqueue('req6', { callback: mockCallback });
      
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(900); // Should wait for rate limit window
    });
    
    it('should clean up old rate limit entries', async () => {
      mockCallback.mockResolvedValue('ok');
      
      // Process some requests
      for (let i = 0; i < 3; i++) {
        await requestQueue.enqueue(`req${i}`, { callback: mockCallback });
      }
      
      // Wait for window to pass
      await testUtils.wait(1100);
      
      // Should be able to process more requests immediately
      const start = Date.now();
      await requestQueue.enqueue('newReq', { callback: mockCallback });
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeLessThan(100); // Should not be delayed
    });
  });
  
  describe('Timeout handling', () => {
    it('should timeout long-running requests', async () => {
      const slowCallback = () => new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        await requestQueue.enqueue(slowCallback, { timeout: 500 });
        fail('Should have timed out');
      } catch (error) {
        expect(error.message).toContain('Request timeout');
      }
      
      expect(requestQueue.getStats().failed).toBe(1);
    });
    
    it('should clear timeout on successful completion', async () => {
      mockCallback.mockResolvedValue('quick');
      
      const result = await requestQueue.enqueue('test', {
        callback: mockCallback,
        timeout: 100
      });
      
      expect(result).toBe('quick');
      
      // Wait to ensure no timeout fires
      await testUtils.wait(150);
      expect(requestQueue.getStats().failed).toBe(0);
    });
  });
  
  describe('Retry logic', () => {
    it('should retry failed requests', async () => {
      mockCallback
        .mockRejectedValueOnce(new Error('TIMEOUT'))
        .mockRejectedValueOnce(new Error('TIMEOUT'))
        .mockResolvedValueOnce('success');
      
      const result = await requestQueue.enqueue('test', {
        callback: mockCallback,
        maxRetries: 3
      });
      
      expect(result).toBe('success');
      expect(mockCallback).toHaveBeenCalledTimes(3);
    });
    
    it('should increase priority on retry', async () => {
      let attemptPriorities = [];
      
      // Track queue state on each attempt
      const trackingCallback = jest.fn().mockImplementation(() => {
        const currentItem = Array.from(requestQueue.processing.values())[0];
        attemptPriorities.push(currentItem.priority);
        
        if (attemptPriorities.length < 2) {
          throw new Error('TIMEOUT');
        }
        return 'success';
      });
      
      await requestQueue.enqueue('test', {
        callback: trackingCallback,
        priority: requestQueue.priorities.LOW,
        maxRetries: 2
      });
      
      expect(attemptPriorities[0]).toBe(requestQueue.priorities.LOW);
      expect(attemptPriorities[1]).toBe(requestQueue.priorities.NORMAL);
    });
    
    it('should not retry non-retryable errors', async () => {
      const nonRetryableError = new Error('Bad request');
      nonRetryableError.status = 400;
      
      mockCallback.mockRejectedValue(nonRetryableError);
      
      await expect(requestQueue.enqueue('test', {
        callback: mockCallback,
        maxRetries: 3
      })).rejects.toThrow('Bad request');
      
      expect(mockCallback).toHaveBeenCalledTimes(1); // No retries
    });
  });
  
  describe('Statistics and monitoring', () => {
    it('should track queue statistics', async () => {
      mockCallback
        .mockResolvedValueOnce('ok1')
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('ok2');
      
      await requestQueue.enqueue('req1', { callback: mockCallback });
      await expect(requestQueue.enqueue('req2', { 
        callback: mockCallback,
        maxRetries: 0 
      })).rejects.toThrow();
      await requestQueue.enqueue('req3', { callback: mockCallback });
      
      const stats = requestQueue.getStats();
      expect(stats.completed).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.queued).toBe(3);
    });
    
    it('should calculate average processing time', async () => {
      const delays = [50, 100, 150];
      
      for (const delay of delays) {
        await requestQueue.enqueue(
          () => new Promise(resolve => setTimeout(() => resolve('ok'), delay))
        );
      }
      
      const stats = requestQueue.getStats();
      expect(stats.avgProcessingTime).toBeGreaterThan(50);
      expect(stats.avgProcessingTime).toBeLessThan(200);
    });
    
    it('should track throughput', async () => {
      mockCallback.mockResolvedValue('ok');
      
      // Process multiple requests
      for (let i = 0; i < 5; i++) {
        await requestQueue.enqueue(`req${i}`, { callback: mockCallback });
      }
      
      const stats = requestQueue.getStats();
      expect(stats.throughput).toBe(5); // All completed within last minute
    });
  });
  
  describe('Queue status', () => {
    it('should provide queue status information', async () => {
      const slowCallback = () => new Promise(resolve => setTimeout(resolve, 100));
      
      // Add some requests
      requestQueue.enqueue(slowCallback);
      requestQueue.enqueue(slowCallback);
      requestQueue.enqueue(slowCallback);
      
      await testUtils.wait(50);
      
      const status = requestQueue.getQueueStatus();
      expect(status.processing).toBe(2);
      expect(status.waiting).toBe(1);
      expect(status.canAcceptMore).toBe(true);
      expect(status.rateLimitRemaining).toBeGreaterThan(0);
    });
  });
  
  describe('Cleanup', () => {
    it('should clear old completed items', async () => {
      mockCallback.mockResolvedValue('ok');
      
      // Process some requests
      for (let i = 0; i < 5; i++) {
        await requestQueue.enqueue(`req${i}`, { callback: mockCallback });
      }
      
      expect(requestQueue.completed.size).toBe(5);
      
      // Wait a bit to ensure completedAt timestamps are in the past
      await testUtils.wait(10);
      
      // Clear items older than 0ms (all items should be older than 0ms ago)
      requestQueue.clearCompleted(0);
      
      expect(requestQueue.completed.size).toBe(0);
    });
  });
});