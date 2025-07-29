import { chromium } from 'playwright';
import { YouTubeUIDetector } from '../lib/youtube-ui-detector.js';

class TranscriptExtractor {
  constructor(options = {}) {
    this.cache = options.cache;
    this.circuitBreaker = options.circuitBreaker;
    this.retryManager = options.retryManager;
    this.browserPool = options.browserPool;
    this.uiDetector = new YouTubeUIDetector();
  }
  
  async extract(videoId) {
    let browser;
    let context;
    let contextId;
    let page;
    
    try {
      // Get browser from pool if available, otherwise create new
      if (this.browserPool) {
        browser = await this.browserPool.getBrowser();
        const contextData = await this.browserPool.getContext(browser);
        context = contextData.context;
        contextId = contextData.contextId;
      } else {
        // Fallback to creating new browser if pool not available
        browser = await chromium.launch({
          headless: process.env.HEADLESS !== 'false',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
          ]
        });
        context = await browser.newContext({
          viewport: { width: 1920, height: 1080 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
      }
      
      page = await context.newPage();
      
      // Block unnecessary resources for faster loading
      await page.route('**/*', route => {
        const blockedResourceTypes = ['image', 'stylesheet', 'font', 'media', 'other'];
        const blockedDomains = [
          'doubleclick.net',
          'google-analytics.com',
          'googletagmanager.com',
          'googlesyndication.com',
          'youtube-nocookie.com',
          'ytimg.com/yts/img',
          'facebook.com',
          'twitter.com'
        ];
        
        const url = route.request().url();
        const resourceType = route.request().resourceType();
        
        if (blockedResourceTypes.includes(resourceType) ||
            blockedDomains.some(domain => url.includes(domain))) {
          return route.abort();
        }
        
        return route.continue();
      });
      
      // Navigate to video
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      // Wait for video to load
      await page.waitForSelector('video', { timeout: 10000 });
      
      // Detect UI version
      const uiVersion = await this.uiDetector.detectUIVersion(page);
      console.log('Detected YouTube UI:', uiVersion);
      
      // Check if transcripts are available
      const hasTranscripts = await this.uiDetector.hasTranscriptsAvailable(page);
      if (!hasTranscripts) {
        throw new Error('No transcripts available for this video');
      }
      
      // Find and click transcript button
      const transcriptButton = await this.uiDetector.findTranscriptButton(page);
      if (!transcriptButton) {
        throw new Error('Could not find transcript button');
      }
      
      await transcriptButton.click();
      
      // Wait for transcript panel
      const panel = await this.uiDetector.waitForTranscriptPanel(page);
      
      // Extract segments
      const segments = await this.uiDetector.extractSegments(page, panel);
      
      if (!segments || segments.length === 0) {
        throw new Error('No transcript segments found');
      }
      
      // Get video metadata
      const title = await page.$eval(
        'h1.title yt-formatted-string, h1 yt-formatted-string',
        el => el.textContent?.trim()
      ).catch(() => 'Unknown Title');
      
      const channel = await page.$eval(
        '#channel-name yt-formatted-string, #owner #text',
        el => el.textContent?.trim()
      ).catch(() => 'Unknown Channel');
      
      // Format transcript
      const transcript = segments.map(segment => ({
        text: segment.text,
        start: this.parseTimestamp(segment.timestamp),
        duration: 5 // Default duration, could be calculated
      }));
      
      return {
        videoId,
        title,
        channel,
        transcript,
        segmentCount: segments.length,
        extractedAt: new Date().toISOString()
      };
      
    } catch (error) {
      // Take screenshot for debugging
      if (page && process.env.DEBUG_SCREENSHOTS === 'true') {
        try {
          await page.screenshot({ 
            path: `debug-${videoId}-${Date.now()}.png`,
            fullPage: true 
          });
        } catch (screenshotError) {
          console.error('Failed to take debug screenshot:', screenshotError);
        }
      }
      
      throw error;
      
    } finally {
      // Cleanup
      if (page) await page.close().catch(() => {});
      
      // If using browser pool, release context; otherwise close everything
      if (this.browserPool && contextId) {
        await this.browserPool.releaseContext(contextId);
      } else {
        if (context) await context.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
      }
    }
  }
  
  parseTimestamp(timestamp) {
    // Convert "MM:SS" or "HH:MM:SS" to seconds
    const parts = timestamp.split(':').map(Number);
    
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    
    return 0;
  }
}

export { TranscriptExtractor };