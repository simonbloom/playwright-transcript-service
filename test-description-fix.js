import { chromium } from 'playwright';

async function testDescriptionFix() {
  console.log('Testing description-based transcript button detection...');
  
  let browser;
  try {
    browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Navigate to the problematic video
    const videoId = 'TaDUNZKL0a4';
    console.log(`Navigating to video: ${videoId}`);
    await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
      waitUntil: 'domcontentloaded'
    });
    
    // Wait for page to stabilize
    await page.waitForTimeout(3000);
    
    console.log('Looking for expand button...');
    
    // Method 1: Try to find and click the expand button
    const expandSelectors = [
      'tp-yt-paper-button#expand',
      'yt-formatted-string.more-button',
      'tp-yt-paper-button.more-button',
      'span[aria-label*="more"]',
      'button[aria-label*="more"]',
      'tp-yt-paper-button[aria-label*="more"]'
    ];
    
    let expandButton = null;
    for (const selector of expandSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          console.log(`Selector ${selector}: ${isVisible ? 'visible' : 'not visible'}`);
          if (isVisible) {
            expandButton = element;
            break;
          }
        }
      } catch (e) {
        console.log(`Error checking selector ${selector}:`, e.message);
      }
    }
    
    if (expandButton) {
      console.log('Found expand button, clicking...');
      await expandButton.click();
      await page.waitForTimeout(1000);
      
      console.log('Looking for transcript button in expanded description...');
      
      // Look for transcript button
      const transcriptSelectors = [
        'button:has-text("Show transcript")',
        'tp-yt-paper-button:has-text("Show transcript")',
        'yt-button-shape:has-text("Show transcript")',
        '[aria-label*="Show transcript"]',
        'button[aria-label*="transcript"]',
        'tp-yt-paper-button[aria-label*="transcript"]'
      ];
      
      for (const selector of transcriptSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            console.log(`Transcript selector ${selector}: ${isVisible ? 'visible' : 'not visible'}`);
            if (isVisible) {
              console.log('Found transcript button!');
              await element.click();
              await page.waitForTimeout(2000);
              
              // Check if transcript panel opened
              const panelSelectors = [
                'ytd-transcript-segment-list-renderer',
                'div[class*="transcript"]',
                '#transcript'
              ];
              
              for (const panelSelector of panelSelectors) {
                const panel = await page.$(panelSelector);
                if (panel && await panel.isVisible()) {
                  console.log('Transcript panel opened successfully!');
                  return;
                }
              }
            }
          }
        } catch (e) {
          console.log(`Error checking transcript selector ${selector}:`, e.message);
        }
      }
    } else {
      console.log('Could not find expand button');
      
      // Try scrolling down to find description
      console.log('Scrolling to find description area...');
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(1000);
      
      // Look for transcript button directly without expanding
      console.log('Looking for transcript button without expanding...');
      const transcriptButton = await page.$('button:has-text("Show transcript"), [aria-label*="Show transcript"]');
      if (transcriptButton && await transcriptButton.isVisible()) {
        console.log('Found transcript button directly!');
        await transcriptButton.click();
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    if (browser) {
      console.log('Press Enter to close browser...');
      await new Promise(resolve => process.stdin.once('data', resolve));
      await browser.close();
    }
  }
}

testDescriptionFix().catch(console.error);