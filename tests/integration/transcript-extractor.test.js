const { TranscriptExtractor } = require('../../services/transcript-extractor');
const { CircuitBreaker } = require('../../lib/circuit-breaker');
const { RetryManager } = require('../../lib/retry-manager');
const { CacheManager } = require('../../lib/cache-manager');

// Mock Playwright
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn()
  }
}));

const { chromium } = require('playwright');

describe('TranscriptExtractor Integration Tests', () => {
  let extractor;
  let mockBrowser;
  let mockContext;
  let mockPage;
  
  beforeEach(() => {
    // Setup mocks
    mockPage = {
      goto: jest.fn().mockResolvedValue(undefined),
      waitForSelector: jest.fn().mockResolvedValue({}),
      $eval: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
      screenshot: jest.fn().mockResolvedValue(undefined)
    };
    
    mockContext = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined)
    };
    
    mockBrowser = {
      newContext: jest.fn().mockResolvedValue(mockContext),
      close: jest.fn().mockResolvedValue(undefined)
    };
    
    chromium.launch.mockResolvedValue(mockBrowser);
    
    // Create extractor with dependencies
    const cache = new CacheManager({ maxSize: 10, maxAge: 1000 });
    const circuitBreaker = new CircuitBreaker({ failureThreshold: 3 });
    const retryManager = new RetryManager({ maxRetries: 2 });
    
    extractor = new TranscriptExtractor({
      cache,
      circuitBreaker,
      retryManager
    });
    
    // Mock UI detector methods
    extractor.uiDetector = {
      detectUIVersion: jest.fn().mockResolvedValue({
        polymer3: true,
        desktop: true
      }),
      hasTranscriptsAvailable: jest.fn().mockResolvedValue(true),
      findTranscriptButton: jest.fn().mockResolvedValue({
        click: jest.fn().mockResolvedValue(undefined)
      }),
      waitForTranscriptPanel: jest.fn().mockResolvedValue({}),
      extractSegments: jest.fn().mockResolvedValue([
        { timestamp: '0:00', text: 'Hello world' },
        { timestamp: '0:05', text: 'This is a test' }
      ])
    };
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Successful extraction', () => {
    it('should extract transcript from YouTube video', async () => {
      mockPage.$eval
        .mockResolvedValueOnce('Test Video Title')
        .mockResolvedValueOnce('Test Channel');
      
      const result = await extractor.extract('test123');
      
      expect(result).toMatchObject({
        videoId: 'test123',
        title: 'Test Video Title',
        channel: 'Test Channel',
        transcript: [
          { text: 'Hello world', start: 0, duration: 5 },
          { text: 'This is a test', start: 5, duration: 5 }
        ],
        segmentCount: 2
      });
      
      expect(chromium.launch).toHaveBeenCalled();
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=test123',
        expect.any(Object)
      );
    });
    
    it('should parse timestamps correctly', () => {
      expect(extractor.parseTimestamp('1:30')).toBe(90);
      expect(extractor.parseTimestamp('10:45')).toBe(645);
      expect(extractor.parseTimestamp('1:00:00')).toBe(3600);
      expect(extractor.parseTimestamp('1:23:45')).toBe(5025);
    });
  });
  
  describe('Error handling', () => {
    it('should handle missing transcripts', async () => {
      extractor.uiDetector.hasTranscriptsAvailable.mockResolvedValue(false);
      
      await expect(extractor.extract('no-transcript'))
        .rejects.toThrow('No transcripts available for this video');
    });
    
    it('should handle missing transcript button', async () => {
      extractor.uiDetector.findTranscriptButton.mockResolvedValue(null);
      
      await expect(extractor.extract('no-button'))
        .rejects.toThrow('Could not find transcript button');
    });
    
    it('should handle empty transcript segments', async () => {
      extractor.uiDetector.extractSegments.mockResolvedValue([]);
      
      await expect(extractor.extract('empty-segments'))
        .rejects.toThrow('No transcript segments found');
    });
    
    it('should handle page navigation timeout', async () => {
      mockPage.goto.mockRejectedValue(new Error('Navigation timeout'));
      
      await expect(extractor.extract('timeout'))
        .rejects.toThrow('Navigation timeout');
    });
    
    it('should take debug screenshot on error', async () => {
      process.env.DEBUG_SCREENSHOTS = 'true';
      
      mockPage.goto.mockRejectedValue(new Error('Test error'));
      
      try {
        await extractor.extract('error-video');
      } catch (error) {
        // Expected to throw
      }
      
      expect(mockPage.screenshot).toHaveBeenCalledWith({
        path: expect.stringContaining('debug-error-video'),
        fullPage: true
      });
      
      delete process.env.DEBUG_SCREENSHOTS;
    });
  });
  
  describe('Browser management', () => {
    it('should launch browser with correct options', async () => {
      await extractor.extract('test123');
      
      expect(chromium.launch).toHaveBeenCalledWith({
        headless: true,
        args: expect.arrayContaining([
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ])
      });
    });
    
    it('should use custom user agent', async () => {
      await extractor.extract('test123');
      
      expect(mockBrowser.newContext).toHaveBeenCalledWith({
        viewport: { width: 1920, height: 1080 },
        userAgent: expect.stringContaining('Mozilla')
      });
    });
    
    it('should cleanup resources on success', async () => {
      await extractor.extract('test123');
      
      expect(mockPage.close).toHaveBeenCalled();
      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });
    
    it('should cleanup resources on error', async () => {
      mockPage.goto.mockRejectedValue(new Error('Test error'));
      
      try {
        await extractor.extract('error');
      } catch (error) {
        // Expected
      }
      
      expect(mockPage.close).toHaveBeenCalled();
      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });
  
  describe('Metadata extraction', () => {
    it('should handle missing video title', async () => {
      mockPage.$eval
        .mockRejectedValueOnce(new Error('No title'))
        .mockResolvedValueOnce('Test Channel');
      
      const result = await extractor.extract('test123');
      
      expect(result.title).toBe('Unknown Title');
      expect(result.channel).toBe('Test Channel');
    });
    
    it('should handle missing channel name', async () => {
      mockPage.$eval
        .mockResolvedValueOnce('Test Video')
        .mockRejectedValueOnce(new Error('No channel'));
      
      const result = await extractor.extract('test123');
      
      expect(result.title).toBe('Test Video');
      expect(result.channel).toBe('Unknown Channel');
    });
  });
  
  describe('UI Detection integration', () => {
    it('should detect and log UI version', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await extractor.extract('test123');
      
      expect(extractor.uiDetector.detectUIVersion).toHaveBeenCalledWith(mockPage);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Detected YouTube UI:',
        expect.objectContaining({ polymer3: true })
      );
      
      consoleSpy.mockRestore();
    });
  });
});