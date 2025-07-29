const { CacheManager } = require('../../lib/cache-manager');

describe('CacheManager', () => {
  let cacheManager;
  
  beforeEach(() => {
    cacheManager = new CacheManager({
      maxSize: 5,
      maxAge: 1000 // 1 second for quick tests
    });
  });
  
  afterEach(() => {
    // Clean up interval
    cacheManager.destroy();
  });
  
  describe('Basic operations', () => {
    it('should store and retrieve values', () => {
      cacheManager.set('key1', { data: 'value1' });
      
      const result = cacheManager.get('key1');
      expect(result).toEqual({ data: 'value1' });
      expect(cacheManager.getStats().hits).toBe(1);
    });
    
    it('should return null for non-existent keys', () => {
      const result = cacheManager.get('nonexistent');
      
      expect(result).toBeNull();
      expect(cacheManager.getStats().misses).toBe(1);
    });
    
    it('should update existing values', () => {
      cacheManager.set('key1', 'original');
      cacheManager.set('key1', 'updated');
      
      const result = cacheManager.get('key1');
      expect(result).toBe('updated');
    });
    
    it('should delete values', () => {
      cacheManager.set('key1', 'value1');
      
      const deleted = cacheManager.delete('key1');
      expect(deleted).toBe(true);
      
      const result = cacheManager.get('key1');
      expect(result).toBeNull();
    });
    
    it('should clear all values', () => {
      cacheManager.set('key1', 'value1');
      cacheManager.set('key2', 'value2');
      cacheManager.set('key3', 'value3');
      
      cacheManager.clear();
      
      expect(cacheManager.get('key1')).toBeNull();
      expect(cacheManager.get('key2')).toBeNull();
      expect(cacheManager.get('key3')).toBeNull();
      expect(cacheManager.getStats().size).toBe(0);
    });
  });
  
  describe('TTL and expiration', () => {
    it('should expire items after TTL', async () => {
      cacheManager.set('key1', 'value1', 100); // 100ms TTL
      
      expect(cacheManager.get('key1')).toBe('value1');
      
      await testUtils.wait(150);
      
      expect(cacheManager.get('key1')).toBeNull();
      expect(cacheManager.getStats().misses).toBe(1);
    });
    
    it('should use default TTL when not specified', async () => {
      cacheManager.set('key1', 'value1'); // Uses default 1000ms
      
      await testUtils.wait(500);
      expect(cacheManager.get('key1')).toBe('value1');
      
      await testUtils.wait(600);
      expect(cacheManager.get('key1')).toBeNull();
    });
    
    it('should clean up expired items during cleanup', async () => {
      cacheManager.set('key1', 'value1', 100);
      cacheManager.set('key2', 'value2', 2000);
      
      await testUtils.wait(150);
      
      cacheManager.cleanup();
      
      expect(cacheManager.cache.size).toBe(1);
      expect(cacheManager.get('key2')).toBe('value2');
    });
  });
  
  describe('LRU eviction', () => {
    it('should evict least recently used item when at capacity', () => {
      // Fill cache to capacity
      for (let i = 1; i <= 5; i++) {
        cacheManager.set(`key${i}`, `value${i}`);
      }
      
      // Access some items to update their order
      cacheManager.get('key2');
      cacheManager.get('key3');
      
      // Add new item (should evict key1 as LRU)
      cacheManager.set('key6', 'value6');
      
      expect(cacheManager.get('key1')).toBeNull(); // Evicted
      expect(cacheManager.get('key2')).toBe('value2'); // Still there
      expect(cacheManager.get('key6')).toBe('value6'); // New item
      expect(cacheManager.getStats().evictions).toBe(1);
    });
    
    it('should update access order on get', () => {
      // Fill cache
      for (let i = 1; i <= 5; i++) {
        cacheManager.set(`key${i}`, `value${i}`);
      }
      
      // Access key1 multiple times
      cacheManager.get('key1');
      cacheManager.get('key1');
      
      // Add new item (should not evict key1)
      cacheManager.set('key6', 'value6');
      
      expect(cacheManager.get('key1')).toBe('value1'); // Still there
      expect(cacheManager.get('key2')).toBeNull(); // Evicted as LRU
    });
    
    it('should handle access order correctly when updating existing items', () => {
      // Fill cache
      for (let i = 1; i <= 5; i++) {
        cacheManager.set(`key${i}`, `value${i}`);
      }
      
      // Update key1 (should move to most recently used)
      cacheManager.set('key1', 'updated1');
      
      // Add new item
      cacheManager.set('key6', 'value6');
      
      expect(cacheManager.get('key1')).toBe('updated1'); // Still there
      expect(cacheManager.get('key2')).toBeNull(); // Evicted
    });
  });
  
  describe('Statistics', () => {
    it('should track hit rate correctly', () => {
      cacheManager.set('key1', 'value1');
      cacheManager.set('key2', 'value2');
      
      // 3 hits
      cacheManager.get('key1');
      cacheManager.get('key1');
      cacheManager.get('key2');
      
      // 2 misses
      cacheManager.get('key3');
      cacheManager.get('key4');
      
      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe('60.00%');
    });
    
    it('should track cache utilization', () => {
      cacheManager.set('key1', 'value1');
      cacheManager.set('key2', 'value2');
      cacheManager.set('key3', 'value3');
      
      const stats = cacheManager.getStats();
      expect(stats.size).toBe(3);
      expect(stats.utilization).toBe('60.00%'); // 3/5 * 100
    });
    
    it('should handle empty cache stats', () => {
      const stats = cacheManager.getStats();
      expect(stats.hitRate).toBe('0%');
      expect(stats.utilization).toBe('0.00%');
    });
  });
  
  describe('Cache key generation', () => {
    it('should generate simple keys for video IDs', () => {
      const key = CacheManager.generateKey('abc123');
      expect(key).toBe('abc123');
    });
    
    it('should include language in key when specified', () => {
      const key = CacheManager.generateKey('abc123', { language: 'en' });
      expect(key).toBe('abc123:en');
    });
    
    it('should include quality in key when specified', () => {
      const key = CacheManager.generateKey('abc123', { quality: 'high' });
      expect(key).toBe('abc123:high');
    });
    
    it('should include multiple options in key', () => {
      const key = CacheManager.generateKey('abc123', {
        language: 'en',
        quality: 'high'
      });
      expect(key).toBe('abc123:en:high');
    });
  });
  
  describe('Cache warming', () => {
    it('should warm up cache with provided entries', () => {
      const entries = [
        ['key1', 'value1'],
        ['key2', 'value2'],
        ['key3', 'value3']
      ];
      
      cacheManager.warmUp(entries);
      
      expect(cacheManager.get('key1')).toBe('value1');
      expect(cacheManager.get('key2')).toBe('value2');
      expect(cacheManager.get('key3')).toBe('value3');
      expect(cacheManager.getStats().size).toBe(3);
    });
    
    it('should not duplicate existing entries during warmup', () => {
      cacheManager.set('key1', 'existing');
      
      const entries = [
        ['key1', 'new'],
        ['key2', 'value2']
      ];
      
      cacheManager.warmUp(entries);
      
      expect(cacheManager.get('key1')).toBe('existing'); // Not overwritten
      expect(cacheManager.get('key2')).toBe('value2');
      expect(cacheManager.getStats().size).toBe(2);
    });
  });
  
  describe('Size estimation', () => {
    it('should estimate size of cached values', () => {
      const smallValue = 'small';
      const largeValue = { 
        data: 'a'.repeat(1000),
        nested: { array: [1, 2, 3, 4, 5] }
      };
      
      const smallSize = cacheManager.estimateSize(smallValue);
      const largeSize = cacheManager.estimateSize(largeValue);
      
      expect(smallSize).toBeLessThan(largeSize);
      expect(largeSize).toBeGreaterThan(1000);
    });
    
    it('should handle circular references gracefully', () => {
      const circular = { a: 1 };
      circular.self = circular;
      
      const size = cacheManager.estimateSize(circular);
      expect(size).toBe(1000); // Default estimate
    });
  });
});