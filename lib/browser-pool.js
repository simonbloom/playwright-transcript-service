/**
 * Browser Pool Manager for Playwright
 * Maintains a pool of warm browser instances to reduce cold start overhead
 */

import { chromium } from 'playwright';

class BrowserPool {
  constructor(options = {}) {
    this.minInstances = options.minInstances || 2;
    this.maxInstances = options.maxInstances || 5;
    this.browserTimeout = options.browserTimeout || 300000; // 5 minutes
    this.contextTimeout = options.contextTimeout || 120000; // 2 minutes
    
    this.pool = [];
    this.activeContexts = new Map();
    this.stats = {
      created: 0,
      reused: 0,
      destroyed: 0,
      errors: 0,
      currentSize: 0
    };
    
    this.browserOptions = {
      headless: process.env.HEADLESS !== 'false',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled',
        // Performance optimizations
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        // Memory optimizations
        '--max_old_space_size=4096',
        '--js-flags=--expose-gc',
        '--aggressive-cache-discard',
        '--memory-pressure-off'
      ]
    };
    
    // Initialize pool
    this.initializePool();
    
    // Periodic health check
    this.healthCheckInterval = setInterval(() => this.performHealthCheck(), 60000);
    
    // Memory pressure monitoring
    this.memoryMonitorInterval = setInterval(() => this.checkMemoryPressure(), 30000);
  }
  
  async initializePool() {
    console.log(`Initializing browser pool with ${this.minInstances} instances...`);
    
    const promises = [];
    for (let i = 0; i < this.minInstances; i++) {
      promises.push(this.createBrowserInstance());
    }
    
    await Promise.all(promises);
    console.log(`Browser pool initialized with ${this.pool.length} instances`);
  }
  
  async createBrowserInstance() {
    try {
      const browser = await chromium.launch(this.browserOptions);
      
      const instance = {
        browser,
        created: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
        contexts: 0
      };
      
      this.pool.push(instance);
      this.stats.created++;
      this.stats.currentSize = this.pool.length;
      
      // Set up browser event handlers
      browser.on('disconnected', () => {
        console.log('Browser disconnected, removing from pool');
        this.removeBrowserFromPool(browser);
      });
      
      return instance;
    } catch (error) {
      console.error('Failed to create browser instance:', error);
      this.stats.errors++;
      throw error;
    }
  }
  
  async getBrowser() {
    // Clean up stale instances first
    await this.cleanupStaleInstances();
    
    // Find available browser
    let instance = this.findAvailableBrowser();
    
    // Create new instance if needed
    if (!instance && this.pool.length < this.maxInstances) {
      console.log('No available browsers, creating new instance...');
      instance = await this.createBrowserInstance();
    }
    
    // Wait for available browser if at max capacity
    if (!instance) {
      console.log('At max capacity, waiting for available browser...');
      instance = await this.waitForAvailableBrowser();
    }
    
    if (!instance) {
      throw new Error('Unable to acquire browser from pool');
    }
    
    // Update usage stats
    instance.lastUsed = Date.now();
    instance.usageCount++;
    this.stats.reused++;
    
    return instance.browser;
  }
  
  async getContext(browser) {
    try {
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        locale: 'en-US',
        timezoneId: 'America/New_York',
        // Optimization: disable images and unnecessary resources
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      
      // Track active context
      const contextId = this.generateId();
      this.activeContexts.set(contextId, {
        context,
        browser,
        created: Date.now()
      });
      
      // Find browser instance and increment context count
      const instance = this.pool.find(inst => inst.browser === browser);
      if (instance) {
        instance.contexts++;
      }
      
      // Set up context cleanup timeout
      setTimeout(() => {
        if (this.activeContexts.has(contextId)) {
          console.log(`Context ${contextId} timed out, cleaning up...`);
          this.releaseContext(contextId);
        }
      }, this.contextTimeout);
      
      return { context, contextId };
    } catch (error) {
      console.error('Failed to create context:', error);
      throw error;
    }
  }
  
  async releaseContext(contextId) {
    const activeContext = this.activeContexts.get(contextId);
    if (!activeContext) return;
    
    try {
      await activeContext.context.close();
    } catch (error) {
      console.error('Error closing context:', error);
    }
    
    // Update browser instance context count
    const instance = this.pool.find(inst => inst.browser === activeContext.browser);
    if (instance) {
      instance.contexts = Math.max(0, instance.contexts - 1);
    }
    
    this.activeContexts.delete(contextId);
  }
  
  findAvailableBrowser() {
    // Sort by least recently used
    const sorted = [...this.pool].sort((a, b) => a.lastUsed - b.lastUsed);
    
    // Find browser with capacity
    return sorted.find(instance => {
      const isHealthy = Date.now() - instance.created < this.browserTimeout;
      const hasCapacity = instance.contexts < 5; // Max 5 contexts per browser
      return isHealthy && hasCapacity;
    });
  }
  
  async waitForAvailableBrowser(timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const instance = this.findAvailableBrowser();
      if (instance) return instance;
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return null;
  }
  
  async cleanupStaleInstances() {
    const now = Date.now();
    const staleInstances = this.pool.filter(instance => 
      now - instance.created > this.browserTimeout ||
      now - instance.lastUsed > this.browserTimeout
    );
    
    for (const instance of staleInstances) {
      await this.destroyInstance(instance);
    }
    
    // Ensure minimum pool size
    while (this.pool.length < this.minInstances) {
      await this.createBrowserInstance();
    }
  }
  
  async destroyInstance(instance) {
    try {
      await instance.browser.close();
    } catch (error) {
      console.error('Error closing browser:', error);
    }
    
    this.removeBrowserFromPool(instance.browser);
    this.stats.destroyed++;
  }
  
  removeBrowserFromPool(browser) {
    this.pool = this.pool.filter(instance => instance.browser !== browser);
    this.stats.currentSize = this.pool.length;
  }
  
  async performHealthCheck() {
    console.log('Performing browser pool health check...');
    
    const unhealthyInstances = [];
    
    for (const instance of this.pool) {
      try {
        // Test if browser is still responsive
        const contexts = instance.browser.contexts();
        if (!contexts) {
          unhealthyInstances.push(instance);
        }
      } catch (error) {
        console.error('Browser health check failed:', error);
        unhealthyInstances.push(instance);
      }
    }
    
    // Replace unhealthy instances
    for (const instance of unhealthyInstances) {
      await this.destroyInstance(instance);
      await this.createBrowserInstance();
    }
    
    console.log(`Health check complete. Pool size: ${this.pool.length}`);
  }
  
  async checkMemoryPressure() {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    
    if (heapUsedMB > 1024) { // 1GB threshold
      console.log(`High memory usage detected: ${heapUsedMB.toFixed(2)}MB`);
      
      // Reduce pool size if needed
      if (this.pool.length > this.minInstances) {
        const instance = this.pool.find(inst => inst.contexts === 0);
        if (instance) {
          await this.destroyInstance(instance);
          console.log('Reduced pool size due to memory pressure');
        }
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        console.log('Forced garbage collection');
      }
    }
  }
  
  generateId() {
    return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  getStats() {
    return {
      ...this.stats,
      activeContexts: this.activeContexts.size,
      poolUtilization: this.pool.length > 0 
        ? (this.pool.filter(i => i.contexts > 0).length / this.pool.length * 100).toFixed(2) + '%'
        : '0%',
      avgUsageCount: this.pool.length > 0
        ? (this.pool.reduce((sum, i) => sum + i.usageCount, 0) / this.pool.length).toFixed(2)
        : 0
    };
  }
  
  async destroy() {
    console.log('Destroying browser pool...');
    
    // Clear intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
    }
    
    // Close all active contexts
    for (const [contextId] of this.activeContexts) {
      await this.releaseContext(contextId);
    }
    
    // Close all browsers
    for (const instance of this.pool) {
      await this.destroyInstance(instance);
    }
    
    console.log('Browser pool destroyed');
  }
}

export { BrowserPool };