import { chromium } from 'playwright';
import { YouTubeUIDetector } from './lib/youtube-ui-detector.js';
import { VisualDebugger } from './lib/visual-debugger.js';

async function testWithVisualDebug() {
  console.log('Starting visual debug test...');
  console.log('=' .repeat(50));
  
  const debugger = new VisualDebugger({
    screenshotDir: './debug-output',
    enableConsoleLog: true,
    saveHTML: true,
    highlightElements: true
  });
  
  let browser;
  try {
    // Launch browser
    browser = await chromium.launch({
      headless: false, // Run with UI for debugging
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080'
      ],
      slowMo: 500 // Slow down actions for visibility
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      recordVideo: {
        dir: './debug-output/videos'
      }
    });
    
    const page = await context.newPage();
    await debugger.setupPage(page, 'youtube-transcript');
    
    // Navigate to YouTube
    console.log('\nNavigating to YouTube...');
    const videoId = 'dQw4w9WgXcQ';
    await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    // Take initial screenshot
    await debugger.screenshot(page, 'initial-load');
    
    // Wait for video player
    console.log('\nWaiting for video player...');
    await page.waitForSelector('video', { timeout: 10000 });
    
    // Analyze page for transcript elements
    console.log('\nAnalyzing page for transcript elements...');
    const analysis = await debugger.analyzeTranscriptElements(page);
    
    // Save page HTML
    await debugger.savePageHTML(page, 'initial-state');
    
    // Use UI detector
    const uiDetector = new YouTubeUIDetector();
    
    // Try different strategies to reveal transcript button
    console.log('\nTrying different strategies to find transcript button...');
    
    // Strategy 1: Scroll down to description
    console.log('\nStrategy 1: Scrolling to description area...');
    await page.evaluate(() => {
      const description = document.querySelector('#description, ytd-video-secondary-info-renderer');
      if (description) {
        description.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    await page.waitForTimeout(2000);
    await debugger.screenshot(page, 'after-scroll');
    
    // Strategy 2: Click "Show more" in description
    console.log('\nStrategy 2: Expanding description...');
    const expandButtons = await page.$$('tp-yt-paper-button#expand, button[aria-label*="Show more"], button[aria-label*="more"]');
    for (const button of expandButtons) {
      try {
        const isVisible = await button.isVisible();
        if (isVisible) {
          console.log('Found expand button, clicking...');
          await button.click();
          await page.waitForTimeout(2000);
          await debugger.screenshot(page, 'after-expand');
          break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    // Strategy 3: Look for three-dots menu
    console.log('\nStrategy 3: Looking for three-dots menu...');
    const menuButtons = await page.$$('button[aria-label*="More actions"], button[aria-label*="Action menu"], ytd-menu-renderer button');
    console.log(`Found ${menuButtons.length} potential menu buttons`);
    
    for (let i = 0; i < menuButtons.length && i < 3; i++) {
      try {
        const button = menuButtons[i];
        const isVisible = await button.isVisible();
        if (isVisible) {
          const label = await button.getAttribute('aria-label');
          console.log(`Clicking menu button ${i + 1}: ${label}`);
          
          await button.click();
          await page.waitForTimeout(2000);
          await debugger.screenshot(page, `menu-open-${i}`);
          
          // Look for transcript in menu
          const menuAnalysis = await debugger.analyzeTranscriptElements(page);
          if (menuAnalysis.buttons.length > analysis.buttons.length ||
              menuAnalysis.textMatches.length > analysis.textMatches.length) {
            console.log('Found new transcript elements in menu!');
          }
          
          // Close menu
          await page.keyboard.press('Escape');
          await page.waitForTimeout(1000);
        }
      } catch (e) {
        console.log(`Error with menu button ${i}: ${e.message}`);
      }
    }
    
    // Monitor for dynamic changes
    console.log('\nMonitoring for dynamic content changes...');
    await debugger.monitorChanges(page, 5000);
    
    // Final analysis
    console.log('\nPerforming final analysis...');
    await debugger.screenshot(page, 'final-state');
    const finalReport = await debugger.generateReport(page);
    
    // Try automated detection one more time
    console.log('\nTrying automated transcript button detection...');
    const transcriptButton = await uiDetector.findTranscriptButton(page, { maxAttempts: 1 });
    
    if (transcriptButton) {
      console.log('\n✅ Transcript button found!');
      await debugger.screenshot(page, 'button-found', {
        highlight: 'button[aria-label*="transcript"], button:has-text("transcript")'
      });
    } else {
      console.log('\n❌ Transcript button not found');
      
      // Log all buttons for manual inspection
      const allButtons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).map(btn => ({
          text: btn.textContent?.trim(),
          ariaLabel: btn.getAttribute('aria-label'),
          visible: btn.offsetParent !== null,
          className: btn.className
        })).filter(btn => btn.text || btn.ariaLabel);
      });
      
      console.log(`\nFound ${allButtons.length} total buttons on page`);
      console.log('Buttons with potential transcript relation:');
      allButtons.forEach((btn, i) => {
        const text = (btn.text + ' ' + btn.ariaLabel).toLowerCase();
        if (text.includes('caption') || text.includes('subtitle') || 
            text.includes('cc') || text.includes('transcript')) {
          console.log(`  ${i + 1}. "${btn.text || btn.ariaLabel}" (visible: ${btn.visible})`);
        }
      });
    }
    
    console.log('\n' + '=' .repeat(50));
    console.log('Visual debug test completed!');
    console.log(`Check the debug-output directory for screenshots and reports`);
    
  } catch (error) {
    console.error('\nTest failed with error:', error);
    console.error(error.stack);
    
    if (page) {
      await debugger.screenshot(page, 'error-state');
      await debugger.generateReport(page, error);
    }
  } finally {
    if (browser) {
      console.log('\nClosing browser in 10 seconds...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      await browser.close();
    }
  }
}

// Run the test
testWithVisualDebug().catch(console.error);