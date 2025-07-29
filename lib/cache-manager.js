import { createHash } from 'crypto';

/**
 * Cache Manager for YouTube Transcript Service
 * 
 * Implements an LRU (Least Recently Used) cache to store transcript data
 * and reduce redundant YouTube requests.
 */
export class CacheManager {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100; // Maximum number of entries
    this.maxAge = options.maxAge || 1800000; // 30 minutes default
    this.cache = new Map();
    this.accessOrder = [];
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000); // Every 5 minutes
  }
  
  /**
   * Get item from cache
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }
    
    // Update access order (LRU)
    this.updateAccessOrder(key);
    
    this.stats.hits++;
    entry.hits++;
    entry.lastAccess = Date.now();
    
    return entry.value;
  }
  
  /**
   * Set item in cache
   */
  set(key, value, options = {}) {
    // Check if we need to evict
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }
    
    const entry = {
      value,
      timestamp: Date.now(),
      lastAccess: Date.now(),
      hits: 0,
      size: this.estimateSize(value),
      metadata: options.metadata || {}
    };
    
    this.cache.set(key, entry);
    this.updateAccessOrder(key);
  }
  
  /**
   * Delete item from cache
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.removeFromAccessOrder(key);
    }
    return deleted;
  }
  
  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    this.accessOrder = [];
    this.stats.evictions += this.cache.size;
  }
  
  /**
   * Update LRU access order
   */
  updateAccessOrder(key) {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }
  
  /**
   * Remove key from access order
   */
  removeFromAccessOrder(key) {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }
  
  /**
   * Evict least recently used item
   */
  evictLRU() {
    if (this.accessOrder.length === 0) return;
    
    const lruKey = this.accessOrder[0];
    this.delete(lruKey);
    this.stats.evictions++;
  }
  
  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.maxAge) {
        expiredKeys.push(key);
      }
    }
    
    expiredKeys.forEach(key => this.delete(key));
  }
  
  /**
   * Estimate size of cached value
   */
  estimateSize(value) {
    // Simple estimation based on JSON string length
    try {
      return JSON.stringify(value).length;
    } catch {
      return 1000; // Default size
    }
  }
  
  /**
   * Get cache statistics
   */
  getStats() {
    const totalSize = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.size, 0);
    
    return {
      ...this.stats,
      size: this.cache.size,
      totalSize,
      hitRate: this.stats.hits > 0 
        ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(1) + '%'
        : '0%',
      utilization: ((this.cache.size / this.maxSize) * 100).toFixed(2) + '%'
    };
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
  
  /**
   * Generate cache key from options
   */
  static generateKey(videoId, options = {}) {
    const keyData = {
      v: videoId,
      l: options.language || 'en',
      q: options.quality || 'auto',
      t: options.transcriptType || 'auto'
    };
    
    // Use a hash for consistent key length
    const keyString = JSON.stringify(keyData);
    return createHash('md5').update(keyString).digest('hex');
  }
  
  /**
   * Get cache key metadata
   */
  static parseKey(key) {
    // For debugging - reverse engineer what a key represents
    return { hash: key };
  }
  
  /**
   * Warm up cache with common requests
   */
  async warmUp(commonVideoIds = []) {
    // Pre-populate cache with frequently requested videos
    console.log(`[Cache] Warming up with ${commonVideoIds.length} videos`);
    // Implementation would fetch these videos proactively
  }
}
