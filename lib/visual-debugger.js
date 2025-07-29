/**
 * Visual Debugger for Playwright
 * Provides enhanced debugging capabilities for UI automation
 */
export class VisualDebugger {
  constructor(options = {}) {
    this.screenshotDir = options.screenshotDir || './debug-screenshots';
    this.enableConsoleLog = options.enableConsoleLog !== false;
    this.saveHTML = options.saveHTML || false;
    this.highlightElements = options.highlightElements !== false;
  }

  /**
   * Set up page debugging
   */
  async setupPage(page, identifier = 'debug') {
    this.identifier = identifier;
    
    if (this.enableConsoleLog) {
      // Log console messages
      page.on('console', msg => {
        const type = msg.type();
        const text = msg.text();
        console.log(`[Browser ${type}] ${text}`);
      });

      // Log page errors
      page.on('pageerror', error => {
        console.error(`[Page Error] ${error.message}`);
      });

      // Log requests
      page.on('request', request => {
        if (request.url().includes('transcript') || request.url().includes('caption')) {
          console.log(`[Request] ${request.method()} ${request.url()}`);
        }
      });

      // Log responses
      page.on('response', response => {
        if (response.url().includes('transcript') || response.url().includes('caption')) {
          console.log(`[Response] ${response.status()} ${response.url()}`);
        }
      });
    }
  }

  /**
   * Take a debug screenshot with annotations
   */
  async screenshot(page, name, options = {}) {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Create directory if needed
    await fs.mkdir(this.screenshotDir, { recursive: true });
    
    const filename = `${this.identifier}-${name}-${Date.now()}.png`;
    const filepath = path.join(this.screenshotDir, filename);
    
    // Highlight elements if requested
    if (options.highlight) {
      await this.highlightElements(page, options.highlight);
    }
    
    // Take screenshot
    await page.screenshot({
      path: filepath,
      fullPage: options.fullPage !== false,
      ...options
    });
    
    console.log(`Screenshot saved: ${filepath}`);
    return filepath;
  }

  /**
   * Highlight elements on the page
   */
  async highlightElements(page, selectors) {
    const selectorsArray = Array.isArray(selectors) ? selectors : [selectors];
    
    for (const selector of selectorsArray) {
      try {
        await page.evaluate((sel) => {
          const elements = document.querySelectorAll(sel);
          elements.forEach(el => {
            el.style.border = '3px solid red';
            el.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
          });
        }, selector);
      } catch (error) {
        console.log(`Could not highlight: ${selector}`);
      }
    }
  }

  /**
   * Analyze page for transcript-related elements
   */
  async analyzeTranscriptElements(page) {
    const analysis = await page.evaluate(() => {
      const results = {
        buttons: [],
        transcriptElements: [],
        potentialSelectors: [],
        textMatches: []
      };

      // Find all buttons
      const buttons = document.querySelectorAll('button');
      buttons.forEach(button => {
        const text = button.textContent?.toLowerCase() || '';
        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
        const title = button.getAttribute('title')?.toLowerCase() || '';
        
        if (text.includes('transcript') || text.includes('caption') || 
            ariaLabel.includes('transcript') || ariaLabel.includes('caption') ||
            title.includes('transcript') || title.includes('caption')) {
          results.buttons.push({
            text: button.textContent?.trim(),
            ariaLabel: button.getAttribute('aria-label'),
            title: button.getAttribute('title'),
            className: button.className,
            id: button.id,
            visible: button.offsetParent !== null,
            rect: button.getBoundingClientRect()
          });
        }
      });

      // Find elements with transcript-related classes or IDs
      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        const className = el.className?.toString().toLowerCase() || '';
        const id = el.id?.toLowerCase() || '';
        
        if (className.includes('transcript') || className.includes('caption') ||
            id.includes('transcript') || id.includes('caption')) {
          results.transcriptElements.push({
            tagName: el.tagName,
            className: el.className?.toString(),
            id: el.id,
            text: el.textContent?.substring(0, 100),
            visible: el.offsetParent !== null
          });
        }
      });

      // Find text containing transcript
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let node;
      while (node = walker.nextNode()) {
        const text = node.textContent?.toLowerCase() || '';
        if (text.includes('transcript') || text.includes('caption')) {
          const parent = node.parentElement;
          if (parent) {
            results.textMatches.push({
              text: node.textContent?.trim(),
              parentTag: parent.tagName,
              parentClass: parent.className?.toString(),
              parentId: parent.id
            });
          }
        }
      }

      return results;
    });

    return analysis;
  }

  /**
   * Save page HTML for analysis
   */
  async savePageHTML(page, name) {
    if (!this.saveHTML) return;
    
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const html = await page.content();
    const filename = `${this.identifier}-${name}-${Date.now()}.html`;
    const filepath = path.join(this.screenshotDir, filename);
    
    await fs.writeFile(filepath, html);
    console.log(`HTML saved: ${filepath}`);
    return filepath;
  }

  /**
   * Log element tree around a selector
   */
  async logElementTree(page, selector, depth = 3) {
    try {
      const tree = await page.evaluate((sel, d) => {
        const element = document.querySelector(sel);
        if (!element) return null;

        function buildTree(el, currentDepth) {
          if (currentDepth === 0 || !el) return null;
          
          return {
            tag: el.tagName,
            id: el.id,
            className: el.className?.toString(),
            text: el.textContent?.substring(0, 50),
            attributes: Array.from(el.attributes).map(attr => ({
              name: attr.name,
              value: attr.value?.substring(0, 50)
            })),
            children: Array.from(el.children).map(child => 
              buildTree(child, currentDepth - 1)
            ).filter(Boolean)
          };
        }

        return buildTree(element, d);
      }, selector, depth);

      if (tree) {
        console.log(`\nElement tree for ${selector}:`);
        console.log(JSON.stringify(tree, null, 2));
      } else {
        console.log(`Element not found: ${selector}`);
      }
    } catch (error) {
      console.error(`Error getting element tree: ${error.message}`);
    }
  }

  /**
   * Wait and log what changes on the page
   */
  async monitorChanges(page, duration = 5000) {
    console.log(`Monitoring page changes for ${duration}ms...`);
    
    const initialState = await page.evaluate(() => {
      return {
        buttonCount: document.querySelectorAll('button').length,
        divCount: document.querySelectorAll('div').length,
        bodyText: document.body.textContent?.length
      };
    });

    await page.waitForTimeout(duration);

    const finalState = await page.evaluate(() => {
      return {
        buttonCount: document.querySelectorAll('button').length,
        divCount: document.querySelectorAll('div').length,
        bodyText: document.body.textContent?.length
      };
    });

    console.log('Page changes:');
    console.log(`- Buttons: ${initialState.buttonCount} → ${finalState.buttonCount}`);
    console.log(`- Divs: ${initialState.divCount} → ${finalState.divCount}`);
    console.log(`- Text length: ${initialState.bodyText} → ${finalState.bodyText}`);
  }

  /**
   * Generate comprehensive debug report
   */
  async generateReport(page, error = null) {
    const report = {
      timestamp: new Date().toISOString(),
      url: page.url(),
      title: await page.title(),
      error: error ? {
        message: error.message,
        stack: error.stack
      } : null,
      viewport: page.viewportSize(),
      transcriptAnalysis: await this.analyzeTranscriptElements(page),
      performance: await page.evaluate(() => {
        const entries = performance.getEntriesByType('navigation')[0];
        return entries ? {
          domContentLoaded: entries.domContentLoadedEventEnd - entries.domContentLoadedEventStart,
          loadComplete: entries.loadEventEnd - entries.loadEventStart,
          totalTime: entries.loadEventEnd - entries.fetchStart
        } : null;
      })
    };

    const fs = await import('fs/promises');
    const path = await import('path');
    
    const filename = `${this.identifier}-report-${Date.now()}.json`;
    const filepath = path.join(this.screenshotDir, filename);
    
    await fs.writeFile(filepath, JSON.stringify(report, null, 2));
    console.log(`\nDebug report saved: ${filepath}`);
    
    // Log summary
    console.log('\nTranscript Analysis Summary:');
    console.log(`- Found ${report.transcriptAnalysis.buttons.length} transcript-related buttons`);
    console.log(`- Found ${report.transcriptAnalysis.transcriptElements.length} transcript elements`);
    console.log(`- Found ${report.transcriptAnalysis.textMatches.length} text matches`);
    
    if (report.transcriptAnalysis.buttons.length > 0) {
      console.log('\nTranscript buttons found:');
      report.transcriptAnalysis.buttons.forEach((btn, i) => {
        console.log(`  ${i + 1}. "${btn.text}" (visible: ${btn.visible})`);
      });
    }
    
    return report;
  }
}