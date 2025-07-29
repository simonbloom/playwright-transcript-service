/**
 * Cache manager for storing and retrieving transcript data
 * Implements LRU (Least Recently Used) eviction policy
 */
class CacheManager {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100; // Maximum number of cached items
    this.maxAge = options.maxAge || 300000; // 5 minutes default TTL
    this.cache = new Map();
    this.accessOrder = [];
    
    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0
    };
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Every minute
  }

  /**
   * Get item from cache
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      return null;
    }
    
    // Check if expired
    if (this.isExpired(item)) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }
    
    // Update last accessed time
    item.lastAccessed = Date.now();
    
    // Update access order (LRU)
    this.updateAccessOrder(key);
    
    this.stats.hits++;
    return item.value;
  }

  /**
   * Set item in cache
   */
  set(key, value, ttl = null) {
    // Check if we need to evict items
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }
    
    const item = {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.maxAge,
      size: this.estimateSize(value)
    };
    
    this.cache.set(key, item);
    this.updateAccessOrder(key);
    this.stats.size = this.cache.size;
  }

  /**
   * Delete item from cache
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      this.stats.size = this.cache.size;
    }
    return deleted;
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    this.accessOrder = [];
    this.stats.size = 0;
  }

  /**
   * Check if item is expired
   */
  isExpired(item) {
    return Date.now() - item.timestamp > item.ttl;
  }

  /**
   * Update access order for LRU
   */
  updateAccessOrder(key) {
    // Remove from current position
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    // Add to end (most recently used)
    this.accessOrder.push(key);
  }

  /**
   * Evict least recently used item
   */
  evictLRU() {
    if (this.accessOrder.length === 0) return;
    
    const lruKey = this.accessOrder.shift();
    this.cache.delete(lruKey);
    this.stats.evictions++;
    this.stats.size = this.cache.size;
    
    console.log(`Cache evicted LRU item: ${lruKey}`);
  }

  /**
   * Clean up expired items
   */
  cleanup() {
    let cleaned = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (this.isExpired(item)) {
        this.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`Cache cleanup: removed ${cleaned} expired items`);
    }
  }

  /**
   * Estimate size of cached value
   */
  estimateSize(value) {
    // Simple estimation based on JSON string length
    try {
      return JSON.stringify(value).length;
    } catch {
      return 1000; // Default estimate
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;
    
    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      utilization: `${(this.cache.size / this.maxSize * 100).toFixed(2)}%`
    };
  }

  /**
   * Generate cache key for YouTube videos
   */
  static generateKey(videoId, options = {}) {
    // Create a more comprehensive key that includes all relevant options
    const keyData = {
      v: videoId,
      l: options.language || 'en',
      q: options.quality || 'auto',
      t: options.transcriptType || 'auto'
    };
    
    // Use a hash for consistent key length
    const crypto = require('crypto');
    const keyString = JSON.stringify(keyData);
    return crypto.createHash('md5').update(keyString).digest('hex');
  }
  
  /**
   * Get cache key metadata
   */
  static parseKey(key) {
    // For debugging - reverse engineer what a key represents
    return { hash: key };
  }
  
  /**
   * Partition cache by access patterns
   */
  partitionCache() {
    const hot = new Map();
    const warm = new Map();
    const cold = new Map();
    
    const now = Date.now();
    const hotThreshold = 60000; // 1 minute
    const warmThreshold = 300000; // 5 minutes
    
    for (const [key, item] of this.cache.entries()) {
      const age = now - item.timestamp;
      const lastAccess = now - (item.lastAccessed || item.timestamp);
      
      if (lastAccess < hotThreshold) {
        hot.set(key, item);
      } else if (lastAccess < warmThreshold) {
        warm.set(key, item);
      } else {
        cold.set(key, item);
      }
    }
    
    return { hot, warm, cold };
  }

  /**
   * Warm up cache with pre-fetched data
   */
  warmUp(entries) {
    let added = 0;
    
    for (const [key, value] of entries) {
      if (!this.cache.has(key)) {
        this.set(key, value);
        added++;
      }
    }
    
    console.log(`Cache warmed up with ${added} entries`);
  }

  /**
   * Destroy cache manager
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

export { CacheManager };