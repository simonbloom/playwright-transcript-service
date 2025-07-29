import { chromium } from 'playwright';
import { YouTubeUIDetector } from './lib/youtube-ui-detector.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_VIDEOS = [
  {
    id: 'dQw4w9WgXcQ',
    name: 'Rick Astley - Never Gonna Give You Up',
    type: 'standard',
    expectedTranscript: true
  },
  {
    id: '9bZkp7q19f0',
    name: 'PSY - Gangnam Style',
    type: 'music_video',
    expectedTranscript: true
  },
  {
    id: 'JGwWNGJdvx8',
    name: 'Ed Sheeran - Shape of You',
    type: 'official_music',
    expectedTranscript: true
  },
  {
    id: 'kJQP7kiw5Fk',
    name: 'Luis Fonsi - Despacito',
    type: 'long_video',
    expectedTranscript: true
  },
  {
    id: 'invalidVideoId123',
    name: 'Invalid Video',
    type: 'invalid',
    expectedTranscript: false
  }
];

// Performance metrics collector
class PerformanceCollector {
  constructor() {
    this.metrics = {
      pageLoad: [],
      transcriptButtonFind: [],
      transcriptPanelLoad: [],
      segmentExtraction: [],
      memoryUsage: [],
      cpuUsage: []
    };
  }

  addMetric(type, value) {
    if (this.metrics[type]) {
      this.metrics[type].push(value);
    }
  }

  getAverages() {
    const averages = {};
    for (const [key, values] of Object.entries(this.metrics)) {
      if (values.length > 0) {
        averages[key] = {
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          count: values.length
        };
      }
    }
    return averages;
  }
}

// Console error collector
class ConsoleErrorCollector {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.logs = [];
  }

  setup(page) {
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      const location = msg.location();
      
      const entry = {
        type,
        text,
        location: location ? `${location.url}:${location.lineNumber}:${location.columnNumber}` : 'unknown',
        timestamp: new Date().toISOString()
      };

      if (type === 'error') {
        this.errors.push(entry);
      } else if (type === 'warning') {
        this.warnings.push(entry);
      } else {
        this.logs.push(entry);
      }
    });

    page.on('pageerror', error => {
      this.errors.push({
        type: 'pageerror',
        text: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    });
  }

  getSummary() {
    return {
      errors: this.errors.length,
      warnings: this.warnings.length,
      logs: this.logs.length,
      details: {
        errors: this.errors,
        warnings: this.warnings
      }
    };
  }
}

// Main test runner
async function runUIDebugTests() {
  const results = {
    timestamp: new Date().toISOString(),
    summary: {
      total: TEST_VIDEOS.length,
      passed: 0,
      failed: 0,
      errors: []
    },
    tests: [],
    performance: new PerformanceCollector(),
    memoryLeaks: []
  };

  const uiDetector = new YouTubeUIDetector();
  let browser;

  try {
    // Launch browser with debugging enabled
    browser = await chromium.launch({
      headless: true, // Running headless for testing
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    // Test each video
    for (const video of TEST_VIDEOS) {
      console.log(`\n\nTesting: ${video.name} (${video.id})`);
      console.log('='.repeat(50));

      const testResult = {
        video,
        success: false,
        duration: 0,
        errors: [],
        consoleErrors: null,
        performance: {},
        screenshots: []
      };

      const startTime = Date.now();
      const consoleCollector = new ConsoleErrorCollector();
      let context, page;

      try {
        // Create new context for each test
        context = await browser.newContext({
          viewport: { width: 1920, height: 1080 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });

        page = await context.newPage();
        consoleCollector.setup(page);

        // Enable performance monitoring
        await page.coverage.startJSCoverage();
        await page.coverage.startCSSCoverage();

        // Navigate to video
        const pageLoadStart = Date.now();
        await page.goto(`https://www.youtube.com/watch?v=${video.id}`, {
          waitUntil: 'networkidle',
          timeout: 30000
        });
        results.performance.addMetric('pageLoad', Date.now() - pageLoadStart);

        // Take initial screenshot
        const screenshotPath = path.join(__dirname, `screenshots/initial-${video.id}.png`);
        await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
        await page.screenshot({ path: screenshotPath, fullPage: true });
        testResult.screenshots.push(screenshotPath);

        // Wait for video player
        await page.waitForSelector('video', { timeout: 10000 });

        // Detect UI version
        const uiVersion = await uiDetector.detectUIVersion(page);
        testResult.uiVersion = uiVersion;
        console.log('UI Version:', uiVersion);

        // Check if transcripts are available
        const hasTranscripts = await uiDetector.hasTranscriptsAvailable(page);
        console.log('Has Transcripts:', hasTranscripts);

        if (hasTranscripts !== video.expectedTranscript) {
          throw new Error(`Expected transcript availability: ${video.expectedTranscript}, but got: ${hasTranscripts}`);
        }

        if (hasTranscripts) {
          // Find transcript button
          const buttonFindStart = Date.now();
          const transcriptButton = await uiDetector.findTranscriptButton(page);
          results.performance.addMetric('transcriptButtonFind', Date.now() - buttonFindStart);

          if (!transcriptButton) {
            throw new Error('Could not find transcript button');
          }

          // Click transcript button
          await transcriptButton.click();

          // Wait for panel
          const panelLoadStart = Date.now();
          const panel = await uiDetector.waitForTranscriptPanel(page);
          results.performance.addMetric('transcriptPanelLoad', Date.now() - panelLoadStart);

          // Take screenshot with panel open
          const panelScreenshotPath = path.join(__dirname, `screenshots/panel-${video.id}.png`);
          await page.screenshot({ path: panelScreenshotPath, fullPage: true });
          testResult.screenshots.push(panelScreenshotPath);

          // Extract segments
          const extractStart = Date.now();
          const segments = await uiDetector.extractSegments(page, panel);
          results.performance.addMetric('segmentExtraction', Date.now() - extractStart);

          testResult.segmentCount = segments.length;
          console.log(`Extracted ${segments.length} segments`);

          // Sample first few segments
          testResult.sampleSegments = segments.slice(0, 3);
        }

        // Collect performance metrics
        const metrics = await page.evaluate(() => {
          return {
            memory: performance.memory ? {
              usedJSHeapSize: performance.memory.usedJSHeapSize,
              totalJSHeapSize: performance.memory.totalJSHeapSize,
              jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
            } : null,
            navigation: performance.getEntriesByType('navigation')[0],
            resources: performance.getEntriesByType('resource').length
          };
        });
        testResult.performance = metrics;

        // Get coverage data
        const jsCoverage = await page.coverage.stopJSCoverage();
        const cssCoverage = await page.coverage.stopCSSCoverage();
        testResult.coverage = {
          js: jsCoverage.length,
          css: cssCoverage.length
        };

        testResult.success = true;
        results.summary.passed++;
        console.log('✅ Test passed');

      } catch (error) {
        testResult.success = false;
        testResult.errors.push(error.message);
        results.summary.failed++;
        results.summary.errors.push(`${video.name}: ${error.message}`);
        console.error('❌ Test failed:', error.message);

        // Take error screenshot
        if (page) {
          const errorScreenshotPath = path.join(__dirname, `screenshots/error-${video.id}.png`);
          await page.screenshot({ path: errorScreenshotPath, fullPage: true });
          testResult.screenshots.push(errorScreenshotPath);
        }
      } finally {
        // Collect console errors
        testResult.consoleErrors = consoleCollector.getSummary();
        
        // Record test duration
        testResult.duration = Date.now() - startTime;

        // Check for memory leaks
        if (page) {
          const finalMetrics = await page.evaluate(() => {
            return performance.memory ? {
              usedJSHeapSize: performance.memory.usedJSHeapSize
            } : null;
          });

          if (finalMetrics && testResult.performance.memory) {
            const memoryIncrease = finalMetrics.usedJSHeapSize - testResult.performance.memory.usedJSHeapSize;
            if (memoryIncrease > 10 * 1024 * 1024) { // 10MB threshold
              results.memoryLeaks.push({
                video: video.name,
                increase: memoryIncrease,
                percentage: (memoryIncrease / testResult.performance.memory.usedJSHeapSize * 100).toFixed(2)
              });
            }
          }
        }

        // Cleanup
        if (page) await page.close();
        if (context) await context.close();

        results.tests.push(testResult);
      }

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

  } finally {
    if (browser) await browser.close();
  }

  // Generate report
  const report = {
    ...results,
    performance: results.performance.getAverages(),
    recommendations: generateRecommendations(results)
  };

  // Save report
  const reportPath = path.join(__dirname, `ui-debug-report-${Date.now()}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n\nReport saved to: ${reportPath}`);

  // Print summary
  printSummary(report);

  return report;
}

// Generate recommendations based on test results
function generateRecommendations(results) {
  const recommendations = [];

  // Performance recommendations
  const avgPageLoad = results.performance.getAverages().pageLoad?.avg;
  if (avgPageLoad > 5000) {
    recommendations.push({
      type: 'performance',
      severity: 'high',
      message: 'Page load time is high. Consider implementing caching or pre-loading strategies.'
    });
  }

  // Console error recommendations
  const totalConsoleErrors = results.tests.reduce((sum, test) => 
    sum + (test.consoleErrors?.errors || 0), 0
  );
  if (totalConsoleErrors > 0) {
    recommendations.push({
      type: 'stability',
      severity: 'medium',
      message: `Found ${totalConsoleErrors} console errors. Review and fix JavaScript errors.`
    });
  }

  // Memory leak recommendations
  if (results.memoryLeaks.length > 0) {
    recommendations.push({
      type: 'memory',
      severity: 'high',
      message: 'Potential memory leaks detected. Implement proper cleanup and resource disposal.'
    });
  }

  // Success rate recommendations
  const successRate = results.summary.passed / results.summary.total;
  if (successRate < 0.8) {
    recommendations.push({
      type: 'reliability',
      severity: 'critical',
      message: 'Low success rate. Review error handling and retry strategies.'
    });
  }

  return recommendations;
}

// Print test summary
function printSummary(report) {
  console.log('\n\n' + '='.repeat(60));
  console.log('UI DEBUG TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${report.summary.total}`);
  console.log(`Passed: ${report.summary.passed}`);
  console.log(`Failed: ${report.summary.failed}`);
  console.log(`Success Rate: ${(report.summary.passed / report.summary.total * 100).toFixed(2)}%`);
  
  console.log('\nPerformance Averages:');
  for (const [metric, data] of Object.entries(report.performance)) {
    console.log(`  ${metric}: ${data.avg.toFixed(2)}ms (min: ${data.min}ms, max: ${data.max}ms)`);
  }

  if (report.memoryLeaks.length > 0) {
    console.log('\n⚠️  Memory Leaks Detected:');
    report.memoryLeaks.forEach(leak => {
      console.log(`  - ${leak.video}: +${(leak.increase / 1024 / 1024).toFixed(2)}MB (${leak.percentage}%)`);
    });
  }

  if (report.recommendations.length > 0) {
    console.log('\n📋 Recommendations:');
    report.recommendations.forEach(rec => {
      console.log(`  [${rec.severity.toUpperCase()}] ${rec.message}`);
    });
  }

  if (report.summary.errors.length > 0) {
    console.log('\n❌ Errors:');
    report.summary.errors.forEach(error => {
      console.log(`  - ${error}`);
    });
  }
}

// Run the tests
runUIDebugTests().catch(console.error);