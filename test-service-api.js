import fetch from 'node-fetch';
import { performance } from 'perf_hooks';

const SERVICE_URL = 'http://localhost:6623';
const API_KEY = process.env.API_KEY || 'test-api-key';

// Test videos with different characteristics
const TEST_CASES = [
  {
    videoId: 'dQw4w9WgXcQ',
    name: 'Standard video with transcripts',
    expectSuccess: true
  },
  {
    videoId: 'invalid123',
    name: 'Invalid video ID',
    expectSuccess: false
  },
  {
    videoId: 'kJQP7kiw5Fk',
    name: 'Long video (Despacito)',
    expectSuccess: true
  }
];

// Performance monitor
class ServiceMonitor {
  constructor() {
    this.metrics = [];
  }

  async measure(name, fn) {
    const start = performance.now();
    const memStart = process.memoryUsage();
    
    try {
      const result = await fn();
      const duration = performance.now() - start;
      const memEnd = process.memoryUsage();
      
      this.metrics.push({
        name,
        duration,
        memory: {
          heapUsed: memEnd.heapUsed - memStart.heapUsed,
          external: memEnd.external - memStart.external
        },
        success: true,
        timestamp: new Date().toISOString()
      });
      
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      
      this.metrics.push({
        name,
        duration,
        error: error.message,
        success: false,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  }

  getReport() {
    const successful = this.metrics.filter(m => m.success);
    const failed = this.metrics.filter(m => !m.success);
    
    return {
      total: this.metrics.length,
      successful: successful.length,
      failed: failed.length,
      avgDuration: successful.length > 0 
        ? successful.reduce((sum, m) => sum + m.duration, 0) / successful.length 
        : 0,
      metrics: this.metrics
    };
  }
}

// Test the service health endpoint
async function testHealthEndpoint() {
  console.log('\nTesting /health endpoint...');
  
  const response = await fetch(`${SERVICE_URL}/health`);
  const data = await response.json();
  
  console.log('Health Status:', data);
  
  if (data.status !== 'healthy') {
    throw new Error('Service is not healthy');
  }
  
  return data;
}

// Test the stats endpoint
async function testStatsEndpoint() {
  console.log('\nTesting /stats endpoint...');
  
  const response = await fetch(`${SERVICE_URL}/stats`, {
    headers: {
      'x-api-key': API_KEY
    }
  });
  
  if (!response.ok) {
    throw new Error(`Stats endpoint failed: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('Service Stats:', JSON.stringify(data, null, 2));
  
  return data;
}

// Test transcript extraction
async function testExtraction(videoId, priority = 'normal') {
  console.log(`\nExtracting transcript for ${videoId} (priority: ${priority})...`);
  
  const startTime = Date.now();
  
  const response = await fetch(`${SERVICE_URL}/extract`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'x-priority': priority
    },
    body: JSON.stringify({ videoId })
  });
  
  const data = await response.json();
  const duration = Date.now() - startTime;
  
  if (!response.ok) {
    console.error(`Extraction failed: ${data.error}`);
    return { success: false, error: data.error, duration };
  }
  
  console.log(`Success! Extracted ${data.segmentCount} segments in ${duration}ms`);
  console.log(`Title: ${data.title}`);
  console.log(`Channel: ${data.channel}`);
  console.log(`From Cache: ${data.fromCache || false}`);
  
  return { success: true, data, duration };
}

// Test concurrent requests
async function testConcurrency() {
  console.log('\n\nTesting concurrent requests...');
  
  const videos = ['dQw4w9WgXcQ', '9bZkp7q19f0', 'JGwWNGJdvx8'];
  const startTime = Date.now();
  
  const promises = videos.map(videoId => 
    testExtraction(videoId, 'high')
  );
  
  const results = await Promise.allSettled(promises);
  const totalDuration = Date.now() - startTime;
  
  console.log(`\nConcurrent test completed in ${totalDuration}ms`);
  
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  console.log(`Success rate: ${successful}/${videos.length}`);
  
  return results;
}

// Test cache functionality
async function testCache() {
  console.log('\n\nTesting cache functionality...');
  
  const videoId = 'dQw4w9WgXcQ';
  
  // First request (should not be cached)
  console.log('First request...');
  const first = await testExtraction(videoId);
  
  if (first.data?.fromCache) {
    console.warn('First request was unexpectedly from cache');
  }
  
  // Second request (should be cached)
  console.log('\nSecond request (should be cached)...');
  const second = await testExtraction(videoId);
  
  if (!second.data?.fromCache) {
    console.error('Second request was not from cache!');
  } else {
    console.log(`Cache hit! Saved ${first.duration - second.duration}ms`);
  }
  
  return { first, second };
}

// Test error handling
async function testErrorHandling() {
  console.log('\n\nTesting error handling...');
  
  const tests = [
    {
      name: 'Missing video ID',
      request: () => fetch(`${SERVICE_URL}/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify({})
      })
    },
    {
      name: 'Invalid API key',
      request: () => fetch(`${SERVICE_URL}/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'invalid-key'
        },
        body: JSON.stringify({ videoId: 'test' })
      })
    },
    {
      name: 'Invalid video ID',
      request: () => testExtraction('invalid_video_id_123')
    }
  ];
  
  for (const test of tests) {
    console.log(`\nTesting: ${test.name}`);
    
    try {
      const response = await test.request();
      
      if (response.ok || response.success) {
        console.error(`Expected error but request succeeded`);
      } else {
        const data = response.json ? await response.json() : response;
        console.log(`✅ Error handled correctly: ${data.error || response.error}`);
      }
    } catch (error) {
      console.log(`✅ Error caught: ${error.message}`);
    }
  }
}

// Test rate limiting
async function testRateLimiting() {
  console.log('\n\nTesting rate limiting...');
  
  const requests = [];
  const videoId = 'dQw4w9WgXcQ';
  
  // Send many requests quickly
  for (let i = 0; i < 10; i++) {
    requests.push(
      fetch(`${SERVICE_URL}/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify({ videoId })
      })
    );
  }
  
  const results = await Promise.allSettled(requests);
  
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const rateLimited = results.filter(r => 
    r.status === 'rejected' || 
    (r.value && !r.value.ok)
  ).length;
  
  console.log(`Sent: 10 requests`);
  console.log(`Successful: ${successful}`);
  console.log(`Rate limited/Failed: ${rateLimited}`);
  
  return { successful, rateLimited };
}

// Main test runner
async function runServiceTests() {
  const monitor = new ServiceMonitor();
  
  console.log('Starting Playwright Service API Tests');
  console.log('=' .repeat(50));
  
  try {
    // Test health endpoint
    await monitor.measure('health', testHealthEndpoint);
    
    // Test stats endpoint
    await monitor.measure('stats', testStatsEndpoint);
    
    // Test individual extractions
    for (const testCase of TEST_CASES) {
      await monitor.measure(
        `extract_${testCase.videoId}`,
        () => testExtraction(testCase.videoId)
      );
    }
    
    // Test advanced features
    await monitor.measure('concurrency', testConcurrency);
    await monitor.measure('cache', testCache);
    await monitor.measure('error_handling', testErrorHandling);
    await monitor.measure('rate_limiting', testRateLimiting);
    
  } catch (error) {
    console.error('Test suite failed:', error);
  }
  
  // Generate report
  const report = monitor.getReport();
  
  console.log('\n\n' + '='.repeat(50));
  console.log('TEST SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total Tests: ${report.total}`);
  console.log(`Successful: ${report.successful}`);
  console.log(`Failed: ${report.failed}`);
  console.log(`Average Duration: ${report.avgDuration.toFixed(2)}ms`);
  
  // Save detailed report
  const fs = await import('fs/promises');
  await fs.writeFile(
    `service-test-report-${Date.now()}.json`,
    JSON.stringify(report, null, 2)
  );
  
  return report;
}

// Run the tests
runServiceTests().catch(console.error);