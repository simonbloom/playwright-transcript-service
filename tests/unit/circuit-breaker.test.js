const { CircuitBreaker } = require('../../lib/circuit-breaker');

describe('CircuitBreaker', () => {
  let circuitBreaker;
  let mockOperation;
  
  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 1000,
      monitoringPeriod: 5000
    });
    mockOperation = jest.fn();
  });
  
  describe('CLOSED state', () => {
    it('should execute operations successfully in CLOSED state', async () => {
      mockOperation.mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalled();
      expect(circuitBreaker.state).toBe('CLOSED');
    });
    
    it('should track failures but remain CLOSED below threshold', async () => {
      mockOperation.mockRejectedValue(new Error('fail'));
      
      // First two failures
      for (let i = 0; i < 2; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('fail');
      }
      
      expect(circuitBreaker.state).toBe('CLOSED');
      expect(circuitBreaker.failures).toBe(2);
    });
    
    it('should transition to OPEN state after reaching failure threshold', async () => {
      mockOperation.mockRejectedValue(new Error('fail'));
      
      // Reach failure threshold
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('fail');
      }
      
      expect(circuitBreaker.state).toBe('OPEN');
      expect(circuitBreaker.failures).toBe(0); // Reset after opening
    });
    
    it('should reset failure count on success', async () => {
      mockOperation
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success');
      
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('fail');
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('fail');
      await circuitBreaker.execute(mockOperation);
      
      expect(circuitBreaker.state).toBe('CLOSED');
      expect(circuitBreaker.failures).toBe(0);
    });
  });
  
  describe('OPEN state', () => {
    beforeEach(async () => {
      // Open the circuit
      mockOperation.mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('fail');
      }
    });
    
    it('should reject operations immediately when OPEN', async () => {
      mockOperation.mockClear();
      
      await expect(circuitBreaker.execute(mockOperation))
        .rejects.toThrow('Circuit breaker is OPEN');
      
      expect(mockOperation).not.toHaveBeenCalled();
    });
    
    it('should transition to HALF_OPEN after reset timeout', async () => {
      await testUtils.wait(1100); // Wait for reset timeout
      
      mockOperation.mockResolvedValue('success');
      await circuitBreaker.execute(mockOperation);
      
      expect(circuitBreaker.state).toBe('HALF_OPEN');
    });
  });
  
  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      // Open then wait for half-open
      mockOperation.mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }
      await testUtils.wait(1100);
    });
    
    it('should close circuit after multiple successes', async () => {
      mockOperation.mockResolvedValue('success');
      
      // First success moves to HALF_OPEN
      await circuitBreaker.execute(mockOperation);
      expect(circuitBreaker.state).toBe('HALF_OPEN');
      
      // Need 3 total successes to close
      await circuitBreaker.execute(mockOperation);
      await circuitBreaker.execute(mockOperation);
      
      expect(circuitBreaker.state).toBe('CLOSED');
    });
    
    it('should reopen circuit on failure in HALF_OPEN state', async () => {
      mockOperation
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('fail'));
      
      // First success moves to HALF_OPEN
      await circuitBreaker.execute(mockOperation);
      expect(circuitBreaker.state).toBe('HALF_OPEN');
      
      // Failure reopens circuit
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('fail');
      expect(circuitBreaker.state).toBe('OPEN');
    });
  });
  
  describe('Metrics and monitoring', () => {
    it('should track request metrics', async () => {
      mockOperation
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success');
      
      await circuitBreaker.execute(mockOperation);
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      await circuitBreaker.execute(mockOperation);
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.totalSuccesses).toBe(2);
      expect(metrics.totalFailures).toBe(1);
      expect(metrics.successRate).toBe('66.67%');
    });
    
    it('should track state changes', async () => {
      mockOperation.mockRejectedValue(new Error('fail'));
      
      // Trigger state change to OPEN
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.stateChanges).toHaveLength(1);
      expect(metrics.stateChanges[0]).toMatchObject({
        from: 'CLOSED',
        to: 'OPEN'
      });
    });
  });
  
  describe('Manual controls', () => {
    it('should reset circuit breaker manually', async () => {
      mockOperation.mockRejectedValue(new Error('fail'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      }
      expect(circuitBreaker.state).toBe('OPEN');
      
      // Manual reset
      circuitBreaker.reset();
      
      expect(circuitBreaker.state).toBe('CLOSED');
      expect(circuitBreaker.failures).toBe(0);
      expect(circuitBreaker.lastFailureTime).toBeNull();
    });
    
    it('should provide current state information', () => {
      const state = circuitBreaker.getState();
      
      expect(state).toHaveProperty('state', 'CLOSED');
      expect(state).toHaveProperty('failures', 0);
      expect(state).toHaveProperty('lastFailureTime', null);
      expect(state).toHaveProperty('metrics');
    });
  });
});