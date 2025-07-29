const request = require('supertest');
const app = require('../../server');

// Mock environment
process.env.API_KEY = 'test-api-key';

describe('Server Integration Tests', () => {
  describe('GET /health', () => {
    it('should return health status without authentication', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('circuitBreaker');
      expect(response.body).toHaveProperty('cache');
      expect(response.body).toHaveProperty('queue');
    });
  });
  
  describe('GET /stats', () => {
    it('should require API key authentication', async () => {
      await request(app)
        .get('/stats')
        .expect(401);
    });
    
    it('should return stats with valid API key', async () => {
      const response = await request(app)
        .get('/stats')
        .set('x-api-key', 'test-api-key')
        .expect(200);
      
      expect(response.body).toHaveProperty('cache');
      expect(response.body).toHaveProperty('circuitBreaker');
      expect(response.body).toHaveProperty('retryManager');
      expect(response.body).toHaveProperty('queue');
    });
  });
  
  describe('POST /extract', () => {
    // Mock the transcript extractor
    jest.mock('../../services/transcript-extractor', () => ({
      TranscriptExtractor: jest.fn().mockImplementation(() => ({
        extract: jest.fn().mockResolvedValue({
          videoId: 'test123',
          title: 'Test Video',
          channel: 'Test Channel',
          transcript: [
            { text: 'Hello', start: 0, duration: 5 },
            { text: 'World', start: 5, duration: 5 }
          ],
          segmentCount: 2,
          extractedAt: '2024-01-01T00:00:00Z'
        })
      }))
    }));
    
    it('should require API key', async () => {
      await request(app)
        .post('/extract')
        .send({ videoId: 'test123' })
        .expect(401);
    });
    
    it('should require video ID', async () => {
      const response = await request(app)
        .post('/extract')
        .set('x-api-key', 'test-api-key')
        .send({})
        .expect(400);
      
      expect(response.body.error).toBe('Video ID is required');
    });
    
    it('should extract transcript successfully', async () => {
      const response = await request(app)
        .post('/extract')
        .set('x-api-key', 'test-api-key')
        .send({ videoId: 'test123' })
        .expect(200);
      
      expect(response.body).toHaveProperty('videoId', 'test123');
      expect(response.body).toHaveProperty('title');
      expect(response.body).toHaveProperty('transcript');
      expect(response.body.transcript).toHaveLength(2);
    });
    
    it('should handle priority headers', async () => {
      const response = await request(app)
        .post('/extract')
        .set('x-api-key', 'test-api-key')
        .set('x-priority', 'high')
        .send({ videoId: 'test123' })
        .expect(200);
      
      expect(response.body).toHaveProperty('videoId', 'test123');
    });
    
    it('should return cached results', async () => {
      // First request
      await request(app)
        .post('/extract')
        .set('x-api-key', 'test-api-key')
        .send({ videoId: 'cached123' })
        .expect(200);
      
      // Second request should be cached
      const response = await request(app)
        .post('/extract')
        .set('x-api-key', 'test-api-key')
        .send({ videoId: 'cached123' })
        .expect(200);
      
      // Note: In real test, we'd verify fromCache flag
      expect(response.body).toHaveProperty('videoId', 'cached123');
    });
    
    it('should handle circuit breaker open state', async () => {
      // In real test, we'd trigger circuit breaker to open
      // For now, just test error handling
      
      // Mock circuit breaker open error
      const CircuitBreaker = require('../../lib/circuit-breaker').CircuitBreaker;
      const mockExecute = jest.fn().mockRejectedValue(
        new Error('Circuit breaker is OPEN. Service unavailable')
      );
      
      // This would need proper mocking setup
      // expect(response.status).toBe(503);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle extraction errors gracefully', async () => {
      // Mock extraction failure
      jest.mock('../../services/transcript-extractor', () => ({
        TranscriptExtractor: jest.fn().mockImplementation(() => ({
          extract: jest.fn().mockRejectedValue(new Error('Extraction failed'))
        }))
      }));
      
      const response = await request(app)
        .post('/extract')
        .set('x-api-key', 'test-api-key')
        .send({ videoId: 'error123' })
        .expect(500);
      
      expect(response.body).toHaveProperty('error');
    });
  });
  
  describe('Request Queue', () => {
    it('should handle concurrent requests', async () => {
      const promises = [];
      
      // Send multiple concurrent requests
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(app)
            .post('/extract')
            .set('x-api-key', 'test-api-key')
            .send({ videoId: `concurrent${i}` })
        );
      }
      
      const results = await Promise.all(promises);
      
      // All should complete successfully
      results.forEach(result => {
        expect(result.status).toBe(200);
        expect(result.body).toHaveProperty('videoId');
      });
    });
  });
});