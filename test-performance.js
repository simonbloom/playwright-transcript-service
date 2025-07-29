/**
 * Performance test script for Playwright transcript service
 * Compares performance before and after optimizations
 */

import fetch from 'node-fetch';

const SERVICE_URL = process.env.SERVICE_URL || 'http://localhost:6623';
const API_KEY = process.env.PUPPETEER_SERVICE_API_KEY || 'test-key';

class PerformanceTester {
  constructor() {
    this.results = {
      requests: [],
      errors: [],
      stats: {
        total: 0,
        successful: 0,
        failed: 0,
        avgResponseTime: 0,
        minResponseTime: Infinity,
        maxResponseTime: 0,
        cacheHits: 0
      }
    };
  }
  
  async runTest(options = {}) {
    const {
      videoIds = ['dQw4w9WgXcQ', 'jNQXAC9IVRw', '9bZkp7q19f0'],
      concurrentRequests = 5,
      totalRequests = 20,
      warmupRequests = 5
    } = options;
    
    console.log('\n🚀 Starting Performance Test');
    console.log('==========================');
    console.log(`Service URL: ${SERVICE_URL}`);
    console.log(`Video IDs: ${videoIds.join(', ')}`);
    console.log(`Concurrent Requests: ${concurrentRequests}`);
    console.log(`Total Requests: ${totalRequests}`);
    console.log(`Warmup Requests: ${warmupRequests}\n`);
    
    // Check service health
    await this.checkHealth();
    
    // Warmup phase
    console.log('🔥 Warmup Phase...');
    for (let i = 0; i < warmupRequests; i++) {
      const videoId = videoIds[i % videoIds.length];
      await this.makeRequest(videoId, true);
    }
    console.log('Warmup complete\n');
    
    // Reset stats after warmup
    this.results = {
      requests: [],
      errors: [],
      stats: {
        total: 0,
        successful: 0,
        failed: 0,
        avgResponseTime: 0,
        minResponseTime: Infinity,
        maxResponseTime: 0,
        cacheHits: 0
      }
    };
    
    // Main test phase
    console.log('🏁 Main Test Phase...');
    const startTime = Date.now();
    
    // Create request batches
    const batches = [];
    for (let i = 0; i < totalRequests; i += concurrentRequests) {
      const batch = [];
      for (let j = 0; j < concurrentRequests && i + j < totalRequests; j++) {
        const videoId = videoIds[(i + j) % videoIds.length];
        batch.push(this.makeRequest(videoId));
      }
      batches.push(batch);
    }
    
    // Execute batches
    for (let i = 0; i < batches.length; i++) {
      console.log(`Processing batch ${i + 1}/${batches.length}...`);
      await Promise.all(batches[i]);
    }
    
    const totalTime = Date.now() - startTime;
    
    // Calculate final stats
    this.calculateStats();
    
    // Get service stats
    const serviceStats = await this.getServiceStats();
    
    // Print results
    this.printResults(totalTime, serviceStats);
  }
  
  async checkHealth() {
    try {
      const response = await fetch(`${SERVICE_URL}/health`);
      const health = await response.json();
      console.log('✅ Service Health Check:', health.status);
      console.log(`   Browser Pool: ${health.browserPool?.currentSize || 0} instances`);
      console.log(`   Memory Usage: ${health.memory?.heapUsed || 'N/A'}\n`);
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      process.exit(1);
    }
  }
  
  async makeRequest(videoId, isWarmup = false) {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${SERVICE_URL}/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify({ videoId })
      });
      
      const data = await response.json();
      const responseTime = Date.now() - startTime;
      
      if (!isWarmup) {
        this.results.stats.total++;
        
        if (response.ok && data.success) {
          this.results.stats.successful++;
          this.results.requests.push({
            videoId,
            responseTime,
            segmentCount: data.segmentCount,
            fromCache: data.fromCache || false
          });
          
          if (data.fromCache) {
            this.results.stats.cacheHits++;
          }
        } else {
          this.results.stats.failed++;
          this.results.errors.push({
            videoId,
            responseTime,
            error: data.error || 'Unknown error'
          });
        }
      }
      
      return { success: response.ok, responseTime };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      if (!isWarmup) {
        this.results.stats.total++;
        this.results.stats.failed++;
        this.results.errors.push({
          videoId,
          responseTime,
          error: error.message
        });
      }
      
      return { success: false, responseTime };
    }
  }
  
  async getServiceStats() {
    try {
      const response = await fetch(`${SERVICE_URL}/stats`, {
        headers: { 'x-api-key': API_KEY }
      });
      return await response.json();
    } catch (error) {
      console.error('Failed to get service stats:', error.message);
      return null;
    }
  }
  
  calculateStats() {
    const responseTimes = this.results.requests.map(r => r.responseTime);
    
    if (responseTimes.length > 0) {
      this.results.stats.avgResponseTime = 
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      this.results.stats.minResponseTime = Math.min(...responseTimes);
      this.results.stats.maxResponseTime = Math.max(...responseTimes);
    }
  }
  
  printResults(totalTime, serviceStats) {
    console.log('\n\n📊 PERFORMANCE TEST RESULTS');
    console.log('===========================\n');
    
    console.log('📈 Request Statistics:');
    console.log(`   Total Requests: ${this.results.stats.total}`);
    console.log(`   Successful: ${this.results.stats.successful} (${(this.results.stats.successful / this.results.stats.total * 100).toFixed(1)}%)`);
    console.log(`   Failed: ${this.results.stats.failed}`);
    console.log(`   Cache Hits: ${this.results.stats.cacheHits} (${(this.results.stats.cacheHits / this.results.stats.successful * 100).toFixed(1)}%)`);
    
    console.log('\n⏱️  Response Times:');
    console.log(`   Average: ${this.results.stats.avgResponseTime.toFixed(0)}ms`);
    console.log(`   Min: ${this.results.stats.minResponseTime}ms`);
    console.log(`   Max: ${this.results.stats.maxResponseTime}ms`);
    console.log(`   P95: ${this.calculatePercentile(95).toFixed(0)}ms`);
    console.log(`   P99: ${this.calculatePercentile(99).toFixed(0)}ms`);
    
    console.log('\n🚀 Throughput:');
    console.log(`   Total Time: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`   Requests/sec: ${(this.results.stats.total / (totalTime / 1000)).toFixed(2)}`);
    
    if (serviceStats) {
      console.log('\n🖥️  Service Statistics:');
      console.log(`   Browser Pool: ${serviceStats.browserPool?.currentSize || 0} instances`);
      console.log(`   Pool Utilization: ${serviceStats.browserPool?.poolUtilization || 'N/A'}`);
      console.log(`   Cache Hit Rate: ${serviceStats.cache?.hitRate || 'N/A'}`);
      console.log(`   Circuit Breaker: ${serviceStats.circuitBreaker?.currentState || 'N/A'}`);
      console.log(`   Queue Throughput: ${serviceStats.queue?.throughput || 0} req/min`);
      console.log(`   Memory Usage: ${serviceStats.system?.memory?.heapUsed || 'N/A'}`);
      console.log(`   Uptime: ${serviceStats.system?.uptime || 'N/A'}`);
    }
    
    if (this.results.errors.length > 0) {
      console.log('\n❌ Errors:');
      const errorSummary = {};
      this.results.errors.forEach(e => {
        errorSummary[e.error] = (errorSummary[e.error] || 0) + 1;
      });
      Object.entries(errorSummary).forEach(([error, count]) => {
        console.log(`   ${error}: ${count}`);
      });
    }
    
    console.log('\n✨ Performance Insights:');
    const avgWithoutCache = this.results.requests
      .filter(r => !r.fromCache)
      .map(r => r.responseTime);
    const avgWithCache = this.results.requests
      .filter(r => r.fromCache)
      .map(r => r.responseTime);
    
    if (avgWithoutCache.length > 0) {
      const avgNoCacheTime = avgWithoutCache.reduce((a, b) => a + b, 0) / avgWithoutCache.length;
      console.log(`   Avg time (no cache): ${avgNoCacheTime.toFixed(0)}ms`);
    }
    
    if (avgWithCache.length > 0) {
      const avgCacheTime = avgWithCache.reduce((a, b) => a + b, 0) / avgWithCache.length;
      console.log(`   Avg time (cached): ${avgCacheTime.toFixed(0)}ms`);
    }
    
    // Performance recommendations
    console.log('\n💡 Recommendations:');
    if (this.results.stats.cacheHits / this.results.stats.successful < 0.3) {
      console.log('   - Low cache hit rate. Consider increasing cache size or TTL.');
    }
    if (this.results.stats.maxResponseTime > 10000) {
      console.log('   - High max response time. Check for timeout issues.');
    }
    if (serviceStats?.browserPool?.poolUtilization > 80) {
      console.log('   - High browser pool utilization. Consider increasing pool size.');
    }
    if (serviceStats?.queue?.throughput < 20) {
      console.log('   - Low throughput. Consider increasing concurrent request limit.');
    }
  }
  
  calculatePercentile(percentile) {
    const times = this.results.requests.map(r => r.responseTime).sort((a, b) => a - b);
    const index = Math.ceil(times.length * (percentile / 100)) - 1;
    return times[index] || 0;
  }
}

// Run test
const tester = new PerformanceTester();

const args = process.argv.slice(2);
const options = {
  concurrentRequests: parseInt(args[0]) || 5,
  totalRequests: parseInt(args[1]) || 20,
  videoIds: args[2] ? args[2].split(',') : undefined
};

console.log('🔧 Performance Test Configuration:');
console.log(`   Usage: node test-performance.js [concurrent] [total] [videoIds]`);
console.log(`   Example: node test-performance.js 10 50 dQw4w9WgXcQ,jNQXAC9IVRw`);

tester.runTest(options).then(() => {
  console.log('\n✅ Performance test complete!');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Performance test failed:', error);
  process.exit(1);
});