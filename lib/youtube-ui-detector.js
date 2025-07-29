/**
 * YouTube UI detector - Handles multiple YouTube UI variations and changes
 * Uses multiple strategies to find transcript button across different layouts
 */
class YouTubeUIDetector {
  constructor() {
    // Known selectors for transcript button across different YouTube versions
    this.transcriptSelectors = {
      // Primary selectors (most common)
      primary: [
        'button[aria-label*="Show transcript" i]',
        'button[aria-label*="transcript" i]',
        'ytd-button-renderer:has-text("Show transcript")',
        'tp-yt-paper-button:has-text("Show transcript")',
        'button:has-text("Show transcript")',
        'yt-formatted-string:has-text("Show transcript")'
      ],
      
      // Three-dots menu selectors (2025 UI)
      menuButton: [
        // Below video three-dots menu (primary location in 2025)
        'ytd-menu-renderer button[aria-label="More actions"]',
        '#info ytd-menu-renderer button[aria-label="More actions"]',
        '#top-level-buttons-computed ytd-menu-renderer button[aria-label="More actions"]',
        '#actions ytd-menu-renderer button',
        '#menu ytd-menu-renderer button',
        // Specific menu button patterns
        'ytd-menu-renderer yt-icon-button#button',
        '#top-row ytd-menu-renderer button',
        '#primary-inner ytd-menu-renderer button',
        // Generic but more specific patterns
        'ytd-menu-renderer button[aria-label*="More" i]',
        'ytd-menu-renderer button[aria-label*="Action" i]',
        // Last resort generic patterns
        'button[aria-label="Action menu"]'
      ],
      
      // Menu item selectors (updated for 2025)
      menuItem: [
        'ytd-menu-service-item-renderer:has-text("Show transcript")',
        'ytd-menu-service-item-renderer:has-text("transcript")',
        'ytd-menu-navigation-item-renderer:has-text("transcript")',
        'tp-yt-paper-item:has-text("Show transcript")',
        'tp-yt-paper-item:has-text("transcript")',
        'yt-formatted-string:has-text("Show transcript")',
        'yt-formatted-string:has-text("transcript")',
        // More generic patterns
        '[role="menuitem"]:has-text("transcript")',
        '.ytd-menu-popup-renderer:has-text("transcript")'
      ],
      
      // Description area selectors (fallback)
      description: [
        'tp-yt-paper-button#expand',
        'ytd-text-inline-expander #expand',
        'tp-yt-paper-button[aria-label*="more" i]',
        'button[aria-label*="Show more" i]',
        '#description #expand',
        'ytd-expander tp-yt-paper-button',
        '.more-button'
      ],
      
      // Transcript panel selectors
      transcriptPanel: [
        'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-transcript"]',
        'ytd-transcript-renderer',
        'ytd-transcript-search-panel-renderer',
        '#panels ytd-engagement-panel-section-list-renderer',
        '#transcript',
        '[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]',
        '.ytd-watch-flexy[panel-id="engagement-panel-transcript"]'
      ],
      
      // Transcript segments (updated)
      segments: [
        'ytd-transcript-segment-renderer',
        'ytd-transcript-segment-list-renderer ytd-transcript-segment-renderer',
        'ytd-transcript-body-renderer cue',
        '.segment-timestamp',
        '.ytd-transcript-segment-renderer',
        'div[class*="transcript-segment"]',
        'yt-formatted-string.segment-text'
      ]
    };
    
    // UI state detection patterns
    this.uiPatterns = {
      isVideoPage: [
        'ytd-watch-flexy',
        'ytd-watch',
        '#movie_player',
        'video.html5-main-video'
      ],
      
      hasTranscript: [
        'button[aria-label*="transcript" i]',
        'ytd-menu-service-item-renderer:has-text("transcript")',
        '[class*="transcript"]'
      ]
    };
  }

  /**
   * Detect current YouTube UI version and layout
   */
  async detectUIVersion(page) {
    const indicators = {
      polymer3: await page.$('ytd-app[is-polymer-3]') !== null,
      mobile: await page.$('ytm-app') !== null,
      desktop: await page.$('ytd-app') !== null,
      oldLayout: await page.$('div#watch7-container') !== null
    };
    
    console.log('YouTube UI detection:', indicators);
    return indicators;
  }

  /**
   * Find transcript button using multiple strategies
   */
  async findTranscriptButton(page, options = {}) {
    const maxAttempts = options.maxAttempts || 3;
    
    // First, ensure page is fully loaded
    await this.waitForPageReady(page);
    
    const strategies = [
      this.findInMenu.bind(this), // Menu is primary in 2025
      this.findDirectButton.bind(this),
      this.findInDescription.bind(this),
      this.findByText.bind(this),
      this.findByAttribute.bind(this)
    ];
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      console.log(`Finding transcript button - Attempt ${attempt + 1}/${maxAttempts}`);
      
      for (const strategy of strategies) {
        try {
          const button = await strategy(page);
          if (button) {
            console.log(`Found transcript button using ${strategy.name}`);
            return button;
          }
        } catch (error) {
          console.log(`Strategy ${strategy.name} failed:`, error.message);
        }
      }
      
      // Wait before retry
      if (attempt < maxAttempts - 1) {
        await page.waitForTimeout(2000);
      }
    }
    
    return null;
  }

  /**
   * Wait for YouTube page to be fully ready
   */
  async waitForPageReady(page) {
    try {
      // Wait for video player
      await page.waitForSelector('video', { timeout: 10000 });
      
      // Wait for action buttons area
      await page.waitForSelector('#top-level-buttons-computed, #menu-container, #info', { 
        timeout: 10000 
      });
      
      // Close any overlays or popups
      await this.closeOverlays(page);
      
      // Additional wait for dynamic content
      await page.waitForTimeout(2000);
      
      console.log('YouTube page is ready');
    } catch (error) {
      console.log('Warning: Page may not be fully loaded:', error.message);
    }
  }

  /**
   * Close any overlays or popups that might block interactions
   */
  async closeOverlays(page) {
    try {
      // Close cookie consent if present
      const cookieButton = await page.$('button[aria-label*="Accept"], button[aria-label*="Reject"], tp-yt-paper-button[aria-label*="Accept"]');
      if (cookieButton) {
        await cookieButton.click();
        console.log('Closed cookie consent');
        await page.waitForTimeout(1000);
      }
      
      // Close any iron-overlay-backdrop
      const overlayBackdrop = await page.$('tp-yt-iron-overlay-backdrop');
      if (overlayBackdrop) {
        // Try to close by clicking outside or pressing Escape
        await page.keyboard.press('Escape');
        console.log('Closed overlay backdrop');
        await page.waitForTimeout(1000);
      }
      
      // Close any modal dialogs
      const modalClose = await page.$('[aria-label*="Close"], .yt-dialog-dismiss');
      if (modalClose) {
        await modalClose.click();
        console.log('Closed modal dialog');
        await page.waitForTimeout(1000);
      }
    } catch (error) {
      console.log('Error closing overlays:', error.message);
    }
  }

  /**
   * Strategy 1: Find direct transcript button
   */
  async findDirectButton(page) {
    for (const selector of this.transcriptSelectors.primary) {
      try {
        const button = await page.waitForSelector(selector, { 
          timeout: 5000,
          state: 'visible'
        });
        if (button) return button;
      } catch {
        // Continue to next selector
      }
    }
    return null;
  }

  /**
   * Strategy 2: Find in three-dots menu
   */
  async findInMenu(page) {
    console.log('Trying menu strategy for transcript button...');
    
    // Find and click menu button
    for (const menuSelector of this.transcriptSelectors.menuButton) {
      try {
        // Wait for menu button to be visible
        const menuButton = await page.waitForSelector(menuSelector, {
          timeout: 3000,
          state: 'visible'
        }).catch(() => null);
        
        if (menuButton) {
          console.log(`Found menu button with selector: ${menuSelector}`);
          
          // Scroll into view if needed
          await menuButton.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);
          
          // Click the menu button
          await menuButton.click();
          console.log('Clicked menu button, waiting for menu items...');
          
          // Wait for menu to appear
          await page.waitForTimeout(1500);
          
          // Try multiple approaches to find transcript item
          // Approach 1: Direct selector match
          for (const itemSelector of this.transcriptSelectors.menuItem) {
            const item = await page.$(itemSelector);
            if (item && await item.isVisible()) {
              console.log(`Found transcript item with selector: ${itemSelector}`);
              return item;
            }
          }
          
          // Approach 2: Text search in menu items
          const menuItems = await page.$$('[role="menuitem"], ytd-menu-service-item-renderer, tp-yt-paper-item');
          for (const item of menuItems) {
            const text = await item.textContent();
            if (text && text.toLowerCase().includes('transcript')) {
              console.log(`Found transcript item by text: ${text}`);
              return item;
            }
          }
          
          // Close menu if not found
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        }
      } catch (error) {
        console.log(`Menu button selector ${menuSelector} failed:`, error.message);
        // Continue to next selector
      }
    }
    
    return null;
  }

  /**
   * Strategy 3: Find in description area
   */
  async findInDescription(page) {
    // First expand description
    for (const expandSelector of this.transcriptSelectors.description) {
      try {
        const expandButton = await page.$(expandSelector);
        if (expandButton) {
          await expandButton.click();
          await page.waitForTimeout(1000);
          
          // Now look for transcript button
          return await this.findDirectButton(page);
        }
      } catch {
        // Continue
      }
    }
    return null;
  }

  /**
   * Strategy 4: Find by text content
   */
  async findByText(page) {
    const transcriptTexts = [
      'Show transcript',
      'Transcript',
      'Show subtitles',
      'View transcript',
      'Open transcript'
    ];
    
    for (const text of transcriptTexts) {
      try {
        const element = await page.locator(`button:has-text("${text}")`).first();
        if (await element.isVisible()) {
          return element;
        }
      } catch {
        // Continue
      }
    }
    return null;
  }

  /**
   * Strategy 5: Find by attributes
   */
  async findByAttribute(page) {
    const buttons = await page.$$('button');
    
    for (const button of buttons) {
      try {
        const ariaLabel = await button.getAttribute('aria-label');
        const title = await button.getAttribute('title');
        const text = await button.textContent();
        
        const combined = `${ariaLabel || ''} ${title || ''} ${text || ''}`.toLowerCase();
        
        if (combined.includes('transcript') || combined.includes('subtitle')) {
          const isVisible = await button.isVisible();
          if (isVisible) return button;
        }
      } catch {
        // Continue
      }
    }
    return null;
  }

  /**
   * Wait for transcript panel to appear
   */
  async waitForTranscriptPanel(page, options = {}) {
    const timeout = options.timeout || 10000;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      for (const selector of this.transcriptSelectors.transcriptPanel) {
        try {
          const panel = await page.$(selector);
          if (panel && await panel.isVisible()) {
            console.log(`Transcript panel found: ${selector}`);
            return panel;
          }
        } catch {
          // Continue
        }
      }
      await page.waitForTimeout(500);
    }
    
    throw new Error('Transcript panel did not appear');
  }

  /**
   * Extract transcript segments with fallback strategies
   */
  async extractSegments(page, panel) {
    const strategies = [
      this.extractModernSegments.bind(this),
      this.extractLegacySegments.bind(this),
      this.extractByClass.bind(this),
      this.extractByStructure.bind(this)
    ];
    
    for (const strategy of strategies) {
      try {
        const segments = await strategy(page, panel);
        if (segments && segments.length > 0) {
          console.log(`Extracted ${segments.length} segments using ${strategy.name}`);
          return segments;
        }
      } catch (error) {
        console.log(`Segment extraction strategy ${strategy.name} failed:`, error.message);
      }
    }
    
    return [];
  }

  /**
   * Extract modern YouTube segments
   */
  async extractModernSegments(page, panel) {
    const segments = [];
    const segmentElements = await panel.$$('ytd-transcript-segment-renderer');
    
    for (const element of segmentElements) {
      const timestamp = await element.$eval(
        '.segment-timestamp',
        el => el.textContent?.trim()
      ).catch(() => null);
      
      const text = await element.$eval(
        '.segment-text',
        el => el.textContent?.trim()
      ).catch(() => null);
      
      if (timestamp && text) {
        segments.push({ timestamp, text });
      }
    }
    
    return segments;
  }

  /**
   * Extract legacy segments
   */
  async extractLegacySegments(page, panel) {
    return await page.evaluate((panelEl) => {
      const segments = [];
      const items = panelEl.querySelectorAll('[class*="transcript-segment"], [class*="cue"]');
      
      items.forEach(item => {
        const timestamp = item.querySelector('[class*="timestamp"]')?.textContent?.trim();
        const text = item.querySelector('[class*="text"]')?.textContent?.trim();
        
        if (timestamp && text) {
          segments.push({ timestamp, text });
        }
      });
      
      return segments;
    }, panel);
  }

  /**
   * Extract by class patterns
   */
  async extractByClass(page, panel) {
    return await page.evaluate(() => {
      const segments = [];
      const possibleContainers = document.querySelectorAll('[class*="transcript"], [id*="transcript"]');
      
      for (const container of possibleContainers) {
        const children = container.querySelectorAll('div, span');
        
        for (let i = 0; i < children.length - 1; i++) {
          const current = children[i].textContent?.trim();
          const next = children[i + 1].textContent?.trim();
          
          // Check if current looks like timestamp
          if (current && /^\d{1,2}:\d{2}/.test(current)) {
            segments.push({
              timestamp: current,
              text: next || ''
            });
            i++; // Skip next element
          }
        }
      }
      
      return segments;
    });
  }

  /**
   * Extract by DOM structure
   */
  async extractByStructure(page, panel) {
    return await page.evaluate(() => {
      const segments = [];
      const allDivs = document.querySelectorAll('div');
      
      for (const div of allDivs) {
        const text = div.textContent?.trim();
        if (!text) continue;
        
        // Look for timestamp pattern at start
        const match = text.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)/);
        if (match) {
          segments.push({
            timestamp: match[1],
            text: match[2]
          });
        }
      }
      
      return segments;
    });
  }

  /**
   * Check if video has transcripts available
   */
  async hasTranscriptsAvailable(page) {
    // Check multiple indicators
    const indicators = await Promise.all([
      // Check for CC button
      page.$('button.ytp-subtitles-button[aria-pressed="true"]'),
      
      // Check for transcript in any menu
      page.$eval('body', () => {
        const text = document.body.textContent?.toLowerCase() || '';
        return text.includes('transcript') || text.includes('subtitle');
      }),
      
      // Check metadata
      page.evaluate(() => {
        const player = document.querySelector('#movie_player');
        return player?.getAvailableQualityLabels?.()?.length > 0;
      })
    ]);
    
    return indicators.some(indicator => !!indicator);
  }
}

export { YouTubeUIDetector };