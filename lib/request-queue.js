/**
 * Request queue manager for handling high load and rate limiting
 * Implements priority queue with concurrency control
 */
class RequestQueue {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 3;
    this.maxQueueSize = options.maxQueueSize || 100;
    this.timeout = options.timeout || 120000; // 2 minutes default
    
    // Priority levels
    this.priorities = {
      HIGH: 3,
      NORMAL: 2,
      LOW: 1
    };
    
    // Queue state
    this.queue = [];
    this.processing = new Map();
    this.completed = new Map();
    
    // Rate limiting
    this.rateLimiter = {
      windowMs: options.rateLimitWindow || 60000, // 1 minute
      maxRequests: options.rateLimitMax || 30,
      requests: []
    };
    
    // Statistics
    this.stats = {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      avgProcessingTime: 0,
      queueWaitTime: 0
    };
  }

  /**
   * Add request to queue
   */
  async enqueue(request, options = {}) {
    const id = this.generateId();
    const priority = options.priority || this.priorities.NORMAL;
    
    // Check queue size limit
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error(`Queue is full (${this.maxQueueSize} items). Try again later.`);
    }
    
    const queueItem = {
      id,
      request,
      priority,
      timestamp: Date.now(),
      status: 'queued',
      retries: 0,
      maxRetries: options.maxRetries || 3,
      callback: options.callback,
      timeout: options.timeout || this.timeout
    };
    
    // Insert into queue based on priority
    this.insertByPriority(queueItem);
    this.stats.queued++;
    
    // Process queue
    this.processQueue();
    
    // Return promise that resolves when request completes
    return new Promise((resolve, reject) => {
      queueItem.resolve = resolve;
      queueItem.reject = reject;
      
      // Set timeout
      queueItem.timeoutId = setTimeout(() => {
        this.handleTimeout(id);
      }, queueItem.timeout);
    });
  }

  /**
   * Insert item into queue maintaining priority order
   */
  insertByPriority(item) {
    let inserted = false;
    
    for (let i = 0; i < this.queue.length; i++) {
      if (item.priority > this.queue[i].priority) {
        this.queue.splice(i, 0, item);
        inserted = true;
        break;
      }
    }
    
    if (!inserted) {
      this.queue.push(item);
    }
  }

  /**
   * Process items in the queue
   */
  async processQueue() {
    // Process multiple items concurrently up to maxConcurrent
    const promises = [];
    
    while (this.processing.size < this.maxConcurrent && this.queue.length > 0) {
      // Check rate limit
      if (!this.checkRateLimit()) {
        console.log('Rate limit reached, waiting...');
        setTimeout(() => this.processQueue(), 1000);
        break;
      }
      
      // Get next item from queue
      const item = this.queue.shift();
      if (!item) continue;
      
      // Update stats
      const waitTime = Date.now() - item.timestamp;
      this.stats.queueWaitTime = (this.stats.queueWaitTime + waitTime) / 2;
      
      // Start processing (don't await - let it run in parallel)
      promises.push(this.processItem(item));
    }
    
    // If we started any processing, wait for at least one to complete
    // before checking if we can process more
    if (promises.length > 0) {
      Promise.race(promises).then(() => {
        // When one completes, check if we can process more
        if (this.queue.length > 0) {
          this.processQueue();
        }
      }).catch(() => {
        // Even on error, check if we can process more
        if (this.queue.length > 0) {
          this.processQueue();
        }
      });
    }
  }

  /**
   * Process individual queue item
   */
  async processItem(item) {
    item.status = 'processing';
    item.startTime = Date.now();
    this.processing.set(item.id, item);
    this.stats.processing = this.processing.size;
    
    try {
      // Record rate limit request
      this.recordRateLimitRequest();
      
      // Execute the request
      const result = await this.executeRequest(item);
      
      // Success
      this.handleSuccess(item, result);
      
    } catch (error) {
      // Handle failure
      this.handleFailure(item, error);
    }
  }

  /**
   * Execute the actual request
   */
  async executeRequest(item) {
    // If callback provided, use it
    if (item.callback) {
      return await item.callback(item.request);
    }
    
    // Otherwise, assume request is a function
    if (typeof item.request === 'function') {
      return await item.request();
    }
    
    throw new Error('Invalid request format. Must be a function or provide callback.');
  }

  /**
   * Handle successful request
   */
  handleSuccess(item, result) {
    clearTimeout(item.timeoutId);
    
    const processingTime = Date.now() - item.startTime;
    this.stats.avgProcessingTime = 
      (this.stats.avgProcessingTime * this.stats.completed + processingTime) / 
      (this.stats.completed + 1);
    
    item.status = 'completed';
    item.result = result;
    item.completedAt = Date.now();
    
    this.processing.delete(item.id);
    this.completed.set(item.id, item);
    this.stats.completed++;
    this.stats.processing = this.processing.size;
    
    // Resolve promise
    if (item.resolve) {
      item.resolve(result);
    }
    
    // Continue processing queue
    this.processQueue();
  }

  /**
   * Handle failed request
   */
  handleFailure(item, error) {
    console.error(`Request ${item.id} failed:`, error.message);
    
    // Check if we should retry
    if (item.retries < item.maxRetries && this.isRetryable(error)) {
      item.retries++;
      item.status = 'retrying';
      console.log(`Retrying request ${item.id} (attempt ${item.retries}/${item.maxRetries})`);
      
      // Re-queue with higher priority
      item.priority = Math.min(item.priority + 1, this.priorities.HIGH);
      this.processing.delete(item.id);
      this.insertByPriority(item);
      
    } else {
      // Final failure
      clearTimeout(item.timeoutId);
      
      item.status = 'failed';
      item.error = error;
      item.failedAt = Date.now();
      
      this.processing.delete(item.id);
      this.stats.failed++;
      this.stats.processing = this.processing.size;
      
      // Reject promise
      if (item.reject) {
        item.reject(error);
      }
    }
    
    // Continue processing queue
    this.processQueue();
  }

  /**
   * Handle request timeout
   */
  handleTimeout(id) {
    const item = this.processing.get(id) || this.queue.find(i => i.id === id);
    if (!item) return;
    
    const error = new Error(`Request timeout after ${item.timeout}ms`);
    error.code = 'TIMEOUT';
    
    this.handleFailure(item, error);
  }

  /**
   * Check if error is retryable
   */
  isRetryable(error) {
    const retryableCodes = ['TIMEOUT', 'ECONNRESET', 'ETIMEDOUT'];
    return retryableCodes.includes(error.code) || 
           error.status >= 500 || 
           error.status === 429;
  }

  /**
   * Check rate limit
   */
  checkRateLimit() {
    const now = Date.now();
    const windowStart = now - this.rateLimiter.windowMs;
    
    // Remove old requests outside window
    this.rateLimiter.requests = this.rateLimiter.requests.filter(
      time => time > windowStart
    );
    
    return this.rateLimiter.requests.length < this.rateLimiter.maxRequests;
  }

  /**
   * Record rate limit request
   */
  recordRateLimitRequest() {
    this.rateLimiter.requests.push(Date.now());
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      processing: this.processing.size,
      throughput: this.getThroughput()
    };
  }

  /**
   * Calculate throughput (requests per minute)
   */
  getThroughput() {
    const recentCompleted = Array.from(this.completed.values())
      .filter(item => Date.now() - item.completedAt < 60000)
      .length;
    
    return recentCompleted;
  }

  /**
   * Clear completed items older than specified age
   */
  clearCompleted(maxAge = 300000) {
    const cutoff = Date.now() - maxAge;
    let cleared = 0;
    
    for (const [id, item] of this.completed.entries()) {
      if (item.completedAt < cutoff) {
        this.completed.delete(id);
        cleared++;
      }
    }
    
    console.log(`Cleared ${cleared} completed items from queue`);
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return {
      waiting: this.queue.length,
      processing: this.processing.size,
      completed: this.completed.size,
      canAcceptMore: this.queue.length < this.maxQueueSize,
      rateLimitRemaining: this.rateLimiter.maxRequests - this.rateLimiter.requests.length
    };
  }
}

export { RequestQueue };