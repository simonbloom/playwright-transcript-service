import express from 'express';
import cors from 'cors';
import { TranscriptExtractor } from './services/transcript-extractor.js';
import { CircuitBreaker } from './lib/circuit-breaker.js';
import { RetryManager } from './lib/retry-manager.js';
import { CacheManager } from './lib/cache-manager.js';
import { RequestQueue } from './lib/request-queue.js';
import { BrowserPool } from './lib/browser-pool.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 6623;

// Initialize browser pool
const browserPool = new BrowserPool({
  minInstances: parseInt(process.env.BROWSER_POOL_MIN) || 2,
  maxInstances: parseInt(process.env.BROWSER_POOL_MAX) || 5,
  browserTimeout: parseInt(process.env.BROWSER_TIMEOUT) || 300000,
  contextTimeout: parseInt(process.env.CONTEXT_TIMEOUT) || 120000
});

// Initialize components
const cache = new CacheManager({
  maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 100,
  maxAge: parseInt(process.env.CACHE_MAX_AGE) || 300000
});

const circuitBreaker = new CircuitBreaker({
  failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD) || 5,
  resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT) || 60000
});

const retryManager = new RetryManager({
  maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
  baseDelay: parseInt(process.env.RETRY_DELAY) || 2000
});

const requestQueue = new RequestQueue({
  maxConcurrent: parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 10, // Increased for true parallelism
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000,
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 50 // Increased for better throughput
});

const extractor = new TranscriptExtractor({
  cache,
  circuitBreaker,
  retryManager,
  browserPool
});

// Middleware
app.use(cors());
app.use(express.json());

// API key validation
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
};

// Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    circuitBreaker: circuitBreaker.getState(),
    cache: cache.getStats(),
    queue: requestQueue.getQueueStatus(),
    browserPool: browserPool.getStats(),
    memory: {
      heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
      external: `${(process.memoryUsage().external / 1024 / 1024).toFixed(2)} MB`
    }
  });
});

app.get('/stats', validateApiKey, (req, res) => {
  const memUsage = process.memoryUsage();
  res.json({
    cache: cache.getStats(),
    circuitBreaker: circuitBreaker.getMetrics(),
    retryManager: retryManager.getStats(),
    queue: requestQueue.getStats(),
    browserPool: browserPool.getStats(),
    system: {
      uptime: `${(process.uptime() / 60).toFixed(2)} minutes`,
      memory: {
        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`,
        rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`
      },
      nodeVersion: process.version,
      platform: process.platform
    }
  });
});

app.post('/extract', validateApiKey, async (req, res) => {
  const { videoId } = req.body;
  
  if (!videoId) {
    return res.status(400).json({ error: 'Video ID is required' });
  }
  
  const priority = req.headers['x-priority'] || 'normal';
  const priorityMap = {
    high: requestQueue.priorities.HIGH,
    normal: requestQueue.priorities.NORMAL,
    low: requestQueue.priorities.LOW
  };
  
  try {
    const result = await requestQueue.enqueue(
      async () => {
        // Check cache first
        const cacheKey = CacheManager.generateKey(videoId);
        const cached = cache.get(cacheKey);
        if (cached) {
          return { ...cached, fromCache: true };
        }
        
        // Extract with circuit breaker protection
        const transcript = await circuitBreaker.execute(
          () => retryManager.executeWithRetry(
            () => extractor.extract(videoId)
          )
        );
        
        // Cache the result
        cache.set(cacheKey, transcript);
        
        return transcript;
      },
      {
        priority: priorityMap[priority] || priorityMap.normal,
        timeout: 120000
      }
    );
    
    res.json(result);
  } catch (error) {
    console.error('Extraction failed:', error);
    
    const statusCode = error.status || 
      (error.message.includes('Circuit breaker is OPEN') ? 503 : 500);
    
    res.status(statusCode).json({
      error: error.message,
      details: error.originalError?.message
    });
  }
});

// Start server
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = app.listen(PORT, () => {
    console.log(`Playwright transcript service running on port ${PORT}`);
    console.log(`Browser pool initialized with ${browserPool.getStats().currentSize} instances`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
  
  // Graceful shutdown
  const gracefulShutdown = async () => {
    console.log('\nShutting down Playwright service...');
    
    // Stop accepting new connections
    server.close(() => {
      console.log('HTTP server closed');
    });
    
    // Clean up resources
    try {
      await browserPool.destroy();
      cache.destroy();
      console.log('All resources cleaned up');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
    
    process.exit(0);
  };
  
  // Handle shutdown signals
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
  
  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown();
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown();
  });
}

export default app;