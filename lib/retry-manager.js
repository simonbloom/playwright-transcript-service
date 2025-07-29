/**
 * Advanced retry manager with exponential backoff, jitter, and intelligent retry decisions
 */
class RetryManager {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.factor = options.factor || 2;
    this.jitter = options.jitter !== false; // Add randomness to prevent thundering herd
    
    // Retry budget to prevent excessive retries
    this.retryBudget = {
      window: options.budgetWindow || 60000, // 1 minute
      maxRetries: options.budgetMaxRetries || 10,
      retries: [],
      
      canRetry() {
        const now = Date.now();
        // Remove old retries outside the window
        this.retries = this.retries.filter(time => now - time < this.window);
        return this.retries.length < this.maxRetries;
      },
      
      recordRetry() {
        this.retries.push(Date.now());
      }
    };
  }

  async executeWithRetry(operation, context = {}) {
    let lastError;
    let attempt = 0;
    
    while (attempt <= this.maxRetries) {
      try {
        // Check retry budget
        if (attempt > 0 && !this.retryBudget.canRetry()) {
          throw new Error('Retry budget exhausted. Too many retries in time window.');
        }
        
        const result = await operation(attempt);
        
        // Success - reset consecutive failures
        if (attempt > 0) {
          console.log(`Operation succeeded after ${attempt} retries`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        // Record retry attempt
        if (attempt > 0) {
          this.retryBudget.recordRetry();
        }
        
        // Check if error is retryable
        if (!this.isRetryable(error, attempt, context)) {
          console.log(`Error is not retryable: ${error.message}`);
          throw error;
        }
        
        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(attempt, error);
        
        console.log(`Retry attempt ${attempt + 1}/${this.maxRetries} after ${delay}ms delay`);
        console.log(`Error: ${error.message}`);
        
        // Wait before retry
        await this.sleep(delay);
        
        attempt++;
      }
    }
    
    // All retries exhausted
    const finalError = new Error(`Operation failed after ${this.maxRetries} retries: ${lastError.message}`);
    finalError.originalError = lastError;
    finalError.attempts = attempt;
    throw finalError;
  }

  isRetryable(error, attempt, context) {
    // Don't retry if we've exhausted attempts
    if (attempt >= this.maxRetries) {
      return false;
    }
    
    // Check error type and message for retryable conditions
    const errorMessage = error.message || '';
    
    // Non-retryable errors
    const nonRetryablePatterns = [
      /video.*not.*found/i,
      /private.*video/i,
      /removed.*video/i,
      /transcript.*not.*available/i,
      /no.*captions/i,
      /invalid.*video.*id/i,
      /authentication.*failed/i,
      /forbidden/i,
      /unauthorized/i
    ];
    
    if (nonRetryablePatterns.some(pattern => pattern.test(errorMessage))) {
      return false;
    }
    
    // Always retry these errors
    const alwaysRetryPatterns = [
      /timeout/i,
      /network/i,
      /ECONNRESET/i,
      /ETIMEDOUT/i,
      /socket.*hang.*up/i,
      /navigation.*failed/i,
      /crashed/i,
      /disconnected/i
    ];
    
    if (alwaysRetryPatterns.some(pattern => pattern.test(errorMessage))) {
      return true;
    }
    
    // Check HTTP status codes if available
    if (error.status) {
      // Retry server errors and rate limits
      if (error.status >= 500 || error.status === 429) {
        return true;
      }
      // Don't retry client errors (except 429)
      if (error.status >= 400 && error.status < 500) {
        return false;
      }
    }
    
    // Default to retry for unknown errors on early attempts
    return attempt < 2;
  }

  calculateDelay(attempt, error) {
    // Base exponential backoff
    let delay = Math.min(
      this.baseDelay * Math.pow(this.factor, attempt),
      this.maxDelay
    );
    
    // Special handling for rate limits
    if (error.status === 429 || /rate.*limit/i.test(error.message)) {
      // Check for Retry-After header
      const retryAfter = error.retryAfter || error.headers?.['retry-after'];
      if (retryAfter) {
        delay = parseInt(retryAfter) * 1000;
      } else {
        // Longer delay for rate limits
        delay = Math.max(delay, 5000 * (attempt + 1));
      }
    }
    
    // Add jitter to prevent thundering herd
    if (this.jitter) {
      const jitterAmount = delay * 0.2; // 20% jitter
      delay = delay + (Math.random() * jitterAmount * 2 - jitterAmount);
    }
    
    return Math.floor(delay);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats() {
    return {
      retryBudget: {
        used: this.retryBudget.retries.length,
        available: this.retryBudget.maxRetries - this.retryBudget.retries.length,
        window: `${this.retryBudget.window / 1000}s`
      }
    };
  }
}

export { RetryManager };