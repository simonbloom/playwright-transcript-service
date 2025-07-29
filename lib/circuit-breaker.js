/**
 * Circuit Breaker implementation for managing service availability
 * Prevents cascading failures by temporarily disabling failing operations
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 300000; // 5 minutes
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    
    // Metrics for monitoring
    this.metrics = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      stateChanges: [],
      lastStateChange: null
    };
  }

  async execute(operation) {
    this.metrics.totalRequests++;
    
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(`Circuit breaker is OPEN. Service unavailable until ${new Date(this.nextAttemptTime).toISOString()}`);
      }
      // Try to move to HALF_OPEN state
      this.setState('HALF_OPEN');
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.metrics.totalSuccesses++;
    this.failures = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      // Need multiple successes to fully close the circuit
      if (this.successes >= 3) {
        this.setState('CLOSED');
        this.successes = 0;
      }
    }
  }

  onFailure() {
    this.metrics.totalFailures++;
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'HALF_OPEN') {
      // Single failure in HALF_OPEN reopens the circuit
      this.setState('OPEN');
    } else if (this.failures >= this.failureThreshold) {
      this.setState('OPEN');
    }
  }

  setState(newState) {
    const oldState = this.state;
    this.state = newState;
    
    this.metrics.stateChanges.push({
      from: oldState,
      to: newState,
      timestamp: new Date().toISOString()
    });
    this.metrics.lastStateChange = Date.now();
    
    if (newState === 'OPEN') {
      this.nextAttemptTime = Date.now() + this.resetTimeout;
      this.failures = 0;
      this.successes = 0;
    }
    
    console.log(`Circuit breaker state changed: ${oldState} -> ${newState}`);
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      metrics: this.getMetrics()
    };
  }

  getMetrics() {
    const successRate = this.metrics.totalRequests > 0 
      ? (this.metrics.totalSuccesses / this.metrics.totalRequests * 100).toFixed(2)
      : 0;
    
    return {
      ...this.metrics,
      successRate: `${successRate}%`,
      currentState: this.state,
      uptime: this.state === 'CLOSED' ? Date.now() - (this.metrics.lastStateChange || 0) : 0
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    console.log('Circuit breaker manually reset');
  }
}

export { CircuitBreaker };