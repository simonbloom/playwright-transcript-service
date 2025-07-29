const { YouTubeUIDetector } = require('../../lib/youtube-ui-detector');

describe('YouTubeUIDetector', () => {
  let detector;
  let mockPage;
  
  beforeEach(() => {
    detector = new YouTubeUIDetector();
    
    // Create comprehensive mock page object
    mockPage = {
      $: jest.fn(),
      $$: jest.fn(),
      $eval: jest.fn(),
      evaluate: jest.fn(),
      waitForSelector: jest.fn(),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      locator: jest.fn(),
      keyboard: {
        press: jest.fn()
      }
    };
  });
  
  describe('UI Version Detection', () => {
    it('should detect Polymer 3 YouTube', async () => {
      mockPage.$.mockImplementation((selector) => {
        if (selector === 'ytd-app[is-polymer-3]') return {};
        if (selector === 'ytd-app') return {};
        return null;
      });
      
      const version = await detector.detectUIVersion(mockPage);
      
      expect(version.polymer3).toBe(true);
      expect(version.desktop).toBe(true);
      expect(version.mobile).toBe(false);
    });
    
    it('should detect mobile YouTube', async () => {
      mockPage.$.mockImplementation((selector) => {
        if (selector === 'ytm-app') return {};
        return null;
      });
      
      const version = await detector.detectUIVersion(mockPage);
      
      expect(version.mobile).toBe(true);
      expect(version.desktop).toBe(false);
    });
    
    it('should detect old YouTube layout', async () => {
      mockPage.$.mockImplementation((selector) => {
        if (selector === 'div#watch7-container') return {};
        return null;
      });
      
      const version = await detector.detectUIVersion(mockPage);
      
      expect(version.oldLayout).toBe(true);
    });
  });
  
  describe('Transcript Button Finding', () => {
    it('should find direct transcript button', async () => {
      const mockButton = { click: jest.fn(), isVisible: jest.fn().mockResolvedValue(true) };
      
      mockPage.waitForSelector.mockResolvedValue(mockButton);
      
      const button = await detector.findTranscriptButton(mockPage);
      
      expect(button).toBe(mockButton);
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        expect.stringContaining('transcript'),
        expect.objectContaining({ timeout: 5000 })
      );
    });
    
    it('should find transcript in menu', async () => {
      const mockMenuButton = { click: jest.fn() };
      const mockMenuItem = { click: jest.fn() };
      
      mockPage.waitForSelector.mockRejectedValue(new Error('Not found'));
      mockPage.$.mockImplementation((selector) => {
        if (selector.includes('More actions')) return mockMenuButton;
        if (selector.includes('transcript')) return mockMenuItem;
        return null;
      });
      
      const button = await detector.findTranscriptButton(mockPage);
      
      expect(button).toBe(mockMenuItem);
      expect(mockMenuButton.click).toHaveBeenCalled();
    });
    
    it('should find transcript after expanding description', async () => {
      const mockExpandButton = { click: jest.fn() };
      const mockTranscriptButton = { isVisible: jest.fn().mockResolvedValue(true) };
      
      let expandClicked = false;
      
      mockPage.$.mockImplementation((selector) => {
        if (selector.includes('expand')) return mockExpandButton;
        return null;
      });
      
      mockPage.waitForSelector.mockImplementation(async () => {
        if (expandClicked) return mockTranscriptButton;
        throw new Error('Not found');
      });
      
      mockExpandButton.click.mockImplementation(() => {
        expandClicked = true;
      });
      
      const button = await detector.findTranscriptButton(mockPage);
      
      expect(button).toBe(mockTranscriptButton);
      expect(mockExpandButton.click).toHaveBeenCalled();
    });
    
    it('should find button by text content', async () => {
      const mockLocator = {
        first: jest.fn().mockReturnThis(),
        isVisible: jest.fn().mockResolvedValue(true)
      };
      
      mockPage.waitForSelector.mockRejectedValue(new Error('Not found'));
      mockPage.$.mockResolvedValue(null);
      mockPage.locator.mockReturnValue(mockLocator);
      
      const button = await detector.findTranscriptButton(mockPage);
      
      expect(button).toBe(mockLocator);
      expect(mockPage.locator).toHaveBeenCalledWith(
        expect.stringContaining('button:has-text')
      );
    });
    
    it('should retry finding button on failure', async () => {
      mockPage.waitForSelector
        .mockRejectedValueOnce(new Error('Not found'))
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce({ isVisible: jest.fn().mockResolvedValue(true) });
      
      const button = await detector.findTranscriptButton(mockPage, { maxAttempts: 3 });
      
      expect(button).toBeTruthy();
      // waitForTimeout is called between retry attempts (maxAttempts - 1)
      expect(mockPage.waitForTimeout).toHaveBeenCalled();
    });
    
    it('should return null if button not found after all attempts', async () => {
      mockPage.waitForSelector.mockRejectedValue(new Error('Not found'));
      mockPage.$.mockResolvedValue(null);
      mockPage.locator.mockReturnValue({
        first: jest.fn().mockReturnThis(),
        isVisible: jest.fn().mockResolvedValue(false)
      });
      mockPage.$$.mockResolvedValue([]);
      
      const button = await detector.findTranscriptButton(mockPage, { maxAttempts: 1 });
      
      expect(button).toBeNull();
    });
  });
  
  describe('Transcript Panel Detection', () => {
    it('should wait for transcript panel to appear', async () => {
      const mockPanel = { isVisible: jest.fn().mockResolvedValue(true) };
      
      mockPage.$.mockImplementation((selector) => {
        if (selector === 'ytd-transcript-renderer') return mockPanel;
        return null;
      });
      
      const panel = await detector.waitForTranscriptPanel(mockPage);
      
      expect(panel).toBe(mockPanel);
    });
    
    it('should timeout if panel does not appear', async () => {
      mockPage.$.mockResolvedValue(null);
      
      await expect(detector.waitForTranscriptPanel(mockPage, { timeout: 100 }))
        .rejects.toThrow('Transcript panel did not appear');
    });
  });
  
  describe('Segment Extraction', () => {
    let mockPanel;
    
    beforeEach(() => {
      mockPanel = {
        $$: jest.fn(),
        $eval: jest.fn()
      };
    });
    
    it('should extract modern YouTube segments', async () => {
      const mockElements = [
        {
          $eval: jest.fn()
            .mockResolvedValueOnce('0:15')
            .mockResolvedValueOnce('First segment text')
        },
        {
          $eval: jest.fn()
            .mockResolvedValueOnce('0:30')
            .mockResolvedValueOnce('Second segment text')
        }
      ];
      
      mockPanel.$$.mockResolvedValue(mockElements);
      
      const segments = await detector.extractSegments(mockPage, mockPanel);
      
      expect(segments).toEqual([
        { timestamp: '0:15', text: 'First segment text' },
        { timestamp: '0:30', text: 'Second segment text' }
      ]);
    });
    
    it('should fall back to legacy extraction', async () => {
      mockPanel.$$.mockResolvedValue([]);
      
      mockPage.evaluate.mockResolvedValue([
        { timestamp: '1:00', text: 'Legacy segment 1' },
        { timestamp: '1:30', text: 'Legacy segment 2' }
      ]);
      
      const segments = await detector.extractSegments(mockPage, mockPanel);
      
      expect(segments).toHaveLength(2);
      expect(segments[0].text).toBe('Legacy segment 1');
    });
    
    it('should extract by class patterns', async () => {
      mockPanel.$$.mockResolvedValue([]);
      mockPage.evaluate
        .mockResolvedValueOnce([]) // Legacy fails
        .mockResolvedValueOnce([
          { timestamp: '2:00', text: 'Class pattern segment' }
        ]);
      
      const segments = await detector.extractSegments(mockPage, mockPanel);
      
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe('Class pattern segment');
    });
    
    it('should return empty array if no extraction works', async () => {
      mockPanel.$$.mockResolvedValue([]);
      mockPage.evaluate.mockResolvedValue([]);
      
      const segments = await detector.extractSegments(mockPage, mockPanel);
      
      expect(segments).toEqual([]);
    });
  });
  
  describe('Transcript Availability', () => {
    it('should detect when transcripts are available', async () => {
      mockPage.$.mockResolvedValue({ pressed: true });
      mockPage.$eval.mockResolvedValue(true);
      mockPage.evaluate.mockResolvedValue(true);
      
      const available = await detector.hasTranscriptsAvailable(mockPage);
      
      expect(available).toBe(true);
    });
    
    it('should detect when transcripts are not available', async () => {
      mockPage.$.mockResolvedValue(null);
      mockPage.$eval.mockResolvedValue(false);
      mockPage.evaluate.mockResolvedValue(false);
      
      const available = await detector.hasTranscriptsAvailable(mockPage);
      
      expect(available).toBe(false);
    });
    
    it('should return true if any indicator shows transcripts', async () => {
      mockPage.$.mockResolvedValue(null);
      mockPage.$eval.mockResolvedValue(true); // Body contains 'transcript'
      mockPage.evaluate.mockResolvedValue(false);
      
      const available = await detector.hasTranscriptsAvailable(mockPage);
      
      expect(available).toBe(true);
    });
  });
  
  describe('Selector Management', () => {
    it('should have comprehensive selector sets', () => {
      expect(detector.transcriptSelectors.primary).toContain(
        'button[aria-label*="Show transcript"]'
      );
      expect(detector.transcriptSelectors.menuButton).toContain(
        'button[aria-label="More actions"]'
      );
      expect(detector.transcriptSelectors.segments).toContain(
        'ytd-transcript-segment-renderer'
      );
    });
    
    it('should have UI pattern detectors', () => {
      expect(detector.uiPatterns.isVideoPage).toContain('ytd-watch-flexy');
      expect(detector.uiPatterns.hasTranscript).toContain(
        'button[aria-label*="transcript" i]'
      );
    });
  });
});