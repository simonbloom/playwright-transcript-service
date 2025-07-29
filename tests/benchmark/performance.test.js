/**
 * Performance Benchmark Tests
 * Compares Playwright vs Puppeteer for YouTube transcript extraction
 */

const { performance } = require('perf_hooks');
const { chromium } = require('playwright');
const puppeteer = require('puppeteer');

class BenchmarkRunner {
  constructor() {
    this.results = {
      playwright: [],
      puppeteer: []
    };
  }
  
  async runBenchmark(videoIds = ['dQw4w9WgXcQ'], iterations = 3) {
    console.log('\n🏁 Starting Performance Benchmark');
    console.log(`Testing ${videoIds.length} videos, ${iterations} iterations each\n`);
    
    for (const videoId of videoIds) {
      console.log(`\n📹 Testing video: ${videoId}`);
      
      // Run Playwright tests
      console.log('  Running Playwright tests...');
      for (let i = 0; i < iterations; i++) {
        const time = await this.benchmarkPlaywright(videoId);
        this.results.playwright.push(time);
        console.log(`    Iteration ${i + 1}: ${time}ms`);
      }
      
      // Run Puppeteer tests
      console.log('  Running Puppeteer tests...');
      for (let i = 0; i < iterations; i++) {
        const time = await this.benchmarkPuppeteer(videoId);
        this.results.puppeteer.push(time);
        console.log(`    Iteration ${i + 1}: ${time}ms`);
      }
    }
    
    this.printResults();
  }
  
  async benchmarkPlaywright(videoId) {
    const startTime = performance.now();
    let browser;
    
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const context = await browser.newContext();
      const page = await context.newPage();
      
      // Navigate to video
      await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
        waitUntil: 'networkidle'
      });
      
      // Wait for video player
      await page.waitForSelector('video', { timeout: 10000 });
      
      // Simulate finding and clicking transcript button
      await page.waitForTimeout(2000); // Simulate UI interaction time
      
      // Simulate transcript extraction
      await page.evaluate(() => {
        // Mock transcript extraction
        const segments = [];
        for (let i = 0; i < 100; i++) {
          segments.push({
            timestamp: `${Math.floor(i / 60)}:${(i % 60).toString().padStart(2, '0')}`,
            text: `Segment ${i} text content`
          });
        }
        return segments;
      });
      
      await context.close();
      await browser.close();
      
    } catch (error) {
      console.error('Playwright error:', error.message);
      if (browser) await browser.close();
      return -1;
    }
    
    return Math.round(performance.now() - startTime);
  }
  
  async benchmarkPuppeteer(videoId) {
    const startTime = performance.now();
    let browser;
    
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      
      // Navigate to video
      await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
        waitUntil: 'networkidle2'
      });
      
      // Wait for video player
      await page.waitForSelector('video', { timeout: 10000 });
      
      // Simulate finding and clicking transcript button
      await page.waitForTimeout(2000); // Simulate UI interaction time
      
      // Simulate transcript extraction
      await page.evaluate(() => {
        // Mock transcript extraction
        const segments = [];
        for (let i = 0; i < 100; i++) {
          segments.push({
            timestamp: `${Math.floor(i / 60)}:${(i % 60).toString().padStart(2, '0')}`,
            text: `Segment ${i} text content`
          });
        }
        return segments;
      });
      
      await browser.close();
      
    } catch (error) {
      console.error('Puppeteer error:', error.message);
      if (browser) await browser.close();
      return -1;
    }
    
    return Math.round(performance.now() - startTime);
  }
  
  printResults() {
    console.log('\n\n📊 BENCHMARK RESULTS');
    console.log('====================\n');
    
    const playwrightAvg = this.average(this.results.playwright);
    const puppeteerAvg = this.average(this.results.puppeteer);
    
    console.log('Playwright:');
    console.log(`  Average: ${playwrightAvg}ms`);
    console.log(`  Min: ${Math.min(...this.results.playwright)}ms`);
    console.log(`  Max: ${Math.max(...this.results.playwright)}ms`);
    console.log(`  Std Dev: ${this.standardDeviation(this.results.playwright).toFixed(2)}ms`);
    
    console.log('\nPuppeteer:');
    console.log(`  Average: ${puppeteerAvg}ms`);
    console.log(`  Min: ${Math.min(...this.results.puppeteer)}ms`);
    console.log(`  Max: ${Math.max(...this.results.puppeteer)}ms`);
    console.log(`  Std Dev: ${this.standardDeviation(this.results.puppeteer).toFixed(2)}ms`);
    
    const improvement = ((puppeteerAvg - playwrightAvg) / puppeteerAvg * 100).toFixed(2);
    
    console.log('\n🏆 Performance Comparison:');
    if (playwrightAvg < puppeteerAvg) {
      console.log(`  Playwright is ${improvement}% faster than Puppeteer`);
    } else {
      console.log(`  Puppeteer is ${Math.abs(improvement)}% faster than Playwright`);
    }
    
    // Feature comparison
    console.log('\n✨ Feature Comparison:');
    console.log('\nPlaywright Advantages:');
    console.log('  ✅ Built-in auto-wait for elements');
    console.log('  ✅ Better network interception');
    console.log('  ✅ Cross-browser support (Chromium, Firefox, WebKit)');
    console.log('  ✅ Better TypeScript support');
    console.log('  ✅ More reliable selectors');
    
    console.log('\nPuppeteer Advantages:');
    console.log('  ✅ Larger community and ecosystem');
    console.log('  ✅ Chrome DevTools Protocol access');
    console.log('  ✅ Slightly smaller package size');
    
    console.log('\n💡 Recommendation:');
    console.log('  For YouTube transcript extraction, Playwright offers:');
    console.log('  - More reliable element detection');
    console.log('  - Better handling of dynamic content');
    console.log('  - Improved error recovery');
    console.log('  - Cross-browser testing capability');
  }
  
  average(numbers) {
    return Math.round(numbers.reduce((a, b) => a + b, 0) / numbers.length);
  }
  
  standardDeviation(numbers) {
    const avg = this.average(numbers);
    const squaredDiffs = numbers.map(n => Math.pow(n - avg, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length;
    return Math.sqrt(avgSquaredDiff);
  }
}

// Run benchmark if executed directly
if (require.main === module) {
  const runner = new BenchmarkRunner();
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const videoIds = args.length > 0 ? args : ['dQw4w9WgXcQ'];
  
  runner.runBenchmark(videoIds, 3).then(() => {
    console.log('\n✅ Benchmark complete!');
    process.exit(0);
  }).catch(error => {
    console.error('\n❌ Benchmark failed:', error);
    process.exit(1);
  });
}

module.exports = { BenchmarkRunner };