// Firecrawl wrapper for MCP Assistant
// Implements website scraping and crawling functionality

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

class FirecrawlWrapper {
  constructor(config = {}) {
    this.config = config;
    this.apiKey = config.firecrawl_api_key || process.env.FIRECRAWL_API_KEY;
    this.cachePath = path.join(os.homedir(), '.mcp-terminal/cache/web_scraper');
    this.cacheSettings = {
      "scrape": 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      "crawl": 7 * 24 * 60 * 60 * 1000,   // 7 days
      "map": 1 * 24 * 60 * 60 * 1000,     // 1 day
    };
    this.firecrawlApp = null;
    this.initializeCache();
  }

  async initializeCache() {
    try {
      // Create cache directory if it doesn't exist
      if (!existsSync(this.cachePath)) {
        await fs.mkdir(this.cachePath, { recursive: true });
      }
    } catch (error) {
      console.error('Error initializing web scraper cache:', error);
    }
  }

  async initialize() {
    try {
      // Only import the Firecrawl SDK if it's installed and API key is available
      if (!this.apiKey) {
        console.warn('⚠️ Firecrawl API key not found. Web scraping functionality will be disabled.');
        return false;
      }

      try {
        // Dynamic import to avoid requiring the package if not configured
        const { default: FirecrawlApp } = await import('@mendable/firecrawl-js');
        this.firecrawlApp = new FirecrawlApp({ apiKey: this.apiKey });
        console.log('🔥 Firecrawl initialized successfully');
        return true;
      } catch (error) {
        console.error('❌ Error importing Firecrawl SDK:', error.message);
        console.error('Make sure you have installed the package: npm install @mendable/firecrawl-js');
        return false;
      }
    } catch (error) {
      console.error('❌ Error initializing Firecrawl:', error.message);
      return false;
    }
  }

  async scrapeUrl(url, options = {}) {
    if (!this.firecrawlApp) {
      if (!await this.initialize()) {
        return {
          success: false,
          error: 'Firecrawl not initialized. Check API key and package installation.'
        };
      }
    }

    // Check cache first
    const cacheKey = this.generateCacheKey(url, options);
    const cachedResult = await this.getFromCache(cacheKey, 'scrape');

    if (cachedResult) {
      console.log('Using cached scrape result');
      return {
        ...cachedResult,
        source: 'cache'
      };
    }

    try {
      // Default options
      const scrapeOptions = {
        formats: ['markdown'],
        ...options
      };

      console.log(`🔍 Scraping URL: ${url}`);
      const response = await this.firecrawlApp.scrapeUrl(url, scrapeOptions);

      if (!response.success) {
        throw new Error(`Failed to scrape: ${response.error}`);
      }

      // Cache the result
      await this.saveToCache(cacheKey, 'scrape', response);

      return response;
    } catch (error) {
      console.error('❌ Error scraping URL:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async crawlUrl(url, options = {}) {
    if (!this.firecrawlApp) {
      if (!await this.initialize()) {
        return {
          success: false,
          error: 'Firecrawl not initialized. Check API key and package installation.'
        };
      }
    }

    // Check cache first
    const cacheKey = this.generateCacheKey(url, options);
    const cachedResult = await this.getFromCache(cacheKey, 'crawl');

    if (cachedResult) {
      console.log('Using cached crawl result');
      return {
        ...cachedResult,
        source: 'cache'
      };
    }

    try {
      // Default options
      const crawlOptions = {
        limit: 10,
        scrapeOptions: {
          formats: ['markdown']
        },
        ...options
      };

      console.log(`🔍 Crawling URL: ${url}`);
      const response = await this.firecrawlApp.crawlUrl(url, crawlOptions);

      if (!response.success) {
        throw new Error(`Failed to crawl: ${response.error}`);
      }

      // Cache the result
      await this.saveToCache(cacheKey, 'crawl', response);

      return response;
    } catch (error) {
      console.error('❌ Error crawling URL:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async mapUrl(url, options = {}) {
    if (!this.firecrawlApp) {
      if (!await this.initialize()) {
        return {
          success: false,
          error: 'Firecrawl not initialized. Check API key and package installation.'
        };
      }
    }

    // Check cache first
    const cacheKey = this.generateCacheKey(url, options);
    const cachedResult = await this.getFromCache(cacheKey, 'map');

    if (cachedResult) {
      console.log('Using cached map result');
      return {
        ...cachedResult,
        source: 'cache'
      };
    }

    try {
      console.log(`🔍 Mapping URL: ${url}`);
      const response = await this.firecrawlApp.mapUrl(url, options);

      if (!response.success) {
        throw new Error(`Failed to map: ${response.error}`);
      }

      // Cache the result
      await this.saveToCache(cacheKey, 'map', response);

      return response;
    } catch (error) {
      console.error('❌ Error mapping URL:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  generateCacheKey(url, options = {}) {
    // Create a unique key based on the URL and options
    const optionsString = JSON.stringify(options);

    // Create a simplified key
    return `${url.replace(/[^\w]/g, '_')}_${Buffer.from(optionsString).toString('base64').substring(0, 20)}`;
  }

  async getFromCache(key, type) {
    try {
      const cacheFile = path.join(this.cachePath, `${type}_${key}.json`);

      if (!existsSync(cacheFile)) {
        return null;
      }

      const data = await fs.readFile(cacheFile, 'utf8');
      const cachedData = JSON.parse(data);

      // Check if cache is expired
      const now = new Date().getTime();
      const cacheTime = new Date(cachedData.timestamp || cachedData.created_at || Date.now()).getTime();
      const cacheDuration = this.cacheSettings[type] || 24 * 60 * 60 * 1000; // Default 1 day

      if (now - cacheTime > cacheDuration) {
        // Cache expired
        return null;
      }

      return cachedData;
    } catch (error) {
      console.error('Error reading from cache:', error);
      return null;
    }
  }

  async saveToCache(key, type, data) {
    try {
      // Add timestamp if not present
      if (!data.timestamp && !data.created_at) {
        data.timestamp = new Date().toISOString();
      }

      const cacheFile = path.join(this.cachePath, `${type}_${key}.json`);
      await fs.writeFile(cacheFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving to cache:', error);
    }
  }

  isConfigured() {
    return !!this.apiKey;
  }
}

export default FirecrawlWrapper;
