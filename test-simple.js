import { chromium } from 'playwright';
import { YouTubeUIDetector } from './lib/youtube-ui-detector.js';

async function testSimple() {
  console.log('Starting simple test...');
  
  let browser;
  try {
    // Launch browser
    console.log('Launching browser...');
    browser = await chromium.launch({
      headless: false, // Run in headful mode to see what's happening
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();
    
    // Set up console logging
    page.on('console', msg => {
      console.log(`[Browser ${msg.type()}] ${msg.text()}`);
    });
    
    page.on('pageerror', error => {
      console.error(`[Browser Error] ${error.message}`);
    });
    
    // Navigate to YouTube - using the problematic video
    console.log('Navigating to YouTube...');
    const videoId = 'TaDUNZKL0a4'; // "Build ANYTHING With This Claude Code MCP Stack"
    await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('Page loaded');
    
    // Wait for video player
    console.log('Waiting for video player...');
    await page.waitForSelector('video', { timeout: 10000 });
    console.log('Video player found');
    
    // Check page title
    const title = await page.title();
    console.log(`Page title: ${title}`);
    
    // Use UI detector
    const uiDetector = new YouTubeUIDetector();
    
    // Detect UI version
    console.log('Detecting UI version...');
    const uiVersion = await uiDetector.detectUIVersion(page);
    console.log('UI Version:', uiVersion);
    
    // Check if transcripts are available
    console.log('Checking transcript availability...');
    const hasTranscripts = await uiDetector.hasTranscriptsAvailable(page);
    console.log('Has Transcripts:', hasTranscripts);
    
    if (hasTranscripts) {
      // Find transcript button
      console.log('Finding transcript button...');
      const transcriptButton = await uiDetector.findTranscriptButton(page);
      
      if (transcriptButton) {
        console.log('Transcript button found!');
        
        // Take screenshot before clicking
        await page.screenshot({ path: 'before-click.png' });
        console.log('Screenshot saved: before-click.png');
        
        // Click button
        console.log('Clicking transcript button...');
        await transcriptButton.click();
        
        // Wait a bit
        await page.waitForTimeout(2000);
        
        // Take screenshot after clicking
        await page.screenshot({ path: 'after-click.png' });
        console.log('Screenshot saved: after-click.png');
        
        // Try to find transcript panel
        console.log('Waiting for transcript panel...');
        try {
          const panel = await uiDetector.waitForTranscriptPanel(page, { timeout: 5000 });
          console.log('Transcript panel found!');
          
          // Extract some segments
          console.log('Extracting segments...');
          const segments = await uiDetector.extractSegments(page, panel);
          console.log(`Found ${segments.length} segments`);
          
          if (segments.length > 0) {
            console.log('\nFirst 3 segments:');
            segments.slice(0, 3).forEach((seg, i) => {
              console.log(`${i + 1}. [${seg.timestamp}] ${seg.text}`);
            });
          }
        } catch (error) {
          console.error('Failed to find transcript panel:', error.message);
        }
      } else {
        console.log('Could not find transcript button');
      }
    } else {
      console.log('No transcripts available for this video');
    }
    
    console.log('\nTest completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
    console.error(error.stack);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the test
testSimple().catch(console.error);