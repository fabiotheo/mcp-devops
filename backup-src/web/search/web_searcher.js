// Web search module for MCP Assistant
// Implements hierarchical search and caching for web results

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import FirecrawlWrapper from '../scraper/index.js';

class WebSearcher {
  constructor(config = {}) {
    this.config = config;
    this.cachePath = path.join(os.homedir(), '.mcp-terminal/cache/web_search');
    this.cacheSettings = {
      "documentation": 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      "error_solutions": 24 * 60 * 60 * 1000,   // 1 day
      "package_info": 1 * 60 * 60 * 1000,       // 1 hour
      "man_pages": 30 * 24 * 60 * 60 * 1000     // 30 days
    };
    this.sources = [
      'man_pages',
      'official_docs',
      'github_issues',
      'stackoverflow'
    ];
    this.initializeCache();

    // Initialize Firecrawl if API key is available
    if (config.firecrawl_api_key) {
      this.firecrawlWrapper = new FirecrawlWrapper({
        firecrawl_api_key: config.firecrawl_api_key
      });
      console.log('🔥 Firecrawl functionality available');
    } else {
      this.firecrawlWrapper = null;
    }
  }

  async initializeCache() {
    try {
      // Create cache directory if it doesn't exist
      if (!existsSync(this.cachePath)) {
        await fs.mkdir(this.cachePath, { recursive: true });
      }
    } catch (error) {
      console.error('Error initializing web search cache:', error);
    }
  }

  async searchDocumentation(query, context = {}) {
    // First check if we have a cached result
    const cacheKey = this.generateCacheKey(query, context);
    const cachedResult = await this.getFromCache(cacheKey, 'documentation');

    if (cachedResult) {
      console.log('Using cached documentation result');
      return {
        ...cachedResult,
        source: 'cache'
      };
    }

    // Implement hierarchical search as described in the issue
    // 1. Check local patterns (handled by caller)
    // 2. Check local cache (done above)
    // 3. Check local documentation (man pages)
    // 4. Search internet

    // For now, we'll simulate a web search result
    const result = await this.searchWeb(query, context);

    // Cache the result
    await this.saveToCache(cacheKey, 'documentation', result);

    return result;
  }

  async searchErrorSolution(error, context = {}) {
    // Similar to searchDocumentation but optimized for error solutions
    const cacheKey = this.generateCacheKey(error, context);
    const cachedResult = await this.getFromCache(cacheKey, 'error_solutions');

    if (cachedResult) {
      console.log('Using cached error solution');
      return {
        ...cachedResult,
        source: 'cache'
      };
    }

    // Implement search for error solutions
    // Prioritize Stack Overflow and GitHub Issues
    const result = await this.searchWeb(error, context, ['stackoverflow', 'github_issues']);

    // Cache the result
    await this.saveToCache(cacheKey, 'error_solutions', result);

    return result;
  }

  async searchPackageInfo(packageName, context = {}) {
    // Search for package information
    const cacheKey = this.generateCacheKey(packageName, context);
    const cachedResult = await this.getFromCache(cacheKey, 'package_info');

    if (cachedResult) {
      console.log('Using cached package info');
      return {
        ...cachedResult,
        source: 'cache'
      };
    }

    // Implement search for package information
    // Prioritize official package repositories
    const result = await this.searchWeb(packageName, context, ['official_docs']);

    // Cache the result
    await this.saveToCache(cacheKey, 'package_info', result);

    return result;
  }

  async searchManPage(command, context = {}) {
    // Search for man pages
    const cacheKey = this.generateCacheKey(command, context);
    const cachedResult = await this.getFromCache(cacheKey, 'man_pages');

    if (cachedResult) {
      console.log('Using cached man page');
      return {
        ...cachedResult,
        source: 'cache'
      };
    }

    // Implement search for man pages
    // Try to find online man pages
    const result = await this.searchWeb(command, context, ['man_pages']);

    // Cache the result
    await this.saveToCache(cacheKey, 'man_pages', result);

    return result;
  }

  async searchWeb(query, context = {}, prioritySources = null) {
    // This would be implemented with actual API calls to search engines or specific sites
    // For now, we'll simulate a response

    // Determine which sources to use
    const sources = prioritySources || this.sources;

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Create a simulated result
    return {
      query,
      context: {
        os: context.os || 'unknown',
        distro: context.distro || 'unknown',
        language: context.language || 'unknown'
      },
      results: [
        {
          title: `Web search result for: ${query}`,
          url: `https://example.com/search?q=${encodeURIComponent(query)}`,
          snippet: `This is a simulated web search result for "${query}". In a real implementation, this would contain actual search results from the web.`,
          source: sources[0]
        }
      ],
      timestamp: new Date().toISOString()
    };
  }

  generateCacheKey(query, context = {}) {
    // Create a unique key based on the query and relevant context
    const contextString = JSON.stringify({
      os: context.os || '',
      distro: context.distro || '',
      version: context.version || '',
      language: context.language || ''
    });

    // Create a hash or simplified key
    return `${query.toLowerCase().replace(/\s+/g, '_')}_${contextString.replace(/[^\w]/g, '')}`;
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
      const cacheTime = new Date(cachedData.timestamp).getTime();
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
      const cacheFile = path.join(this.cachePath, `${type}_${key}.json`);
      await fs.writeFile(cacheFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving to cache:', error);
    }
  }

  // Helper method to make HTTP requests
  async makeHttpRequest(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          resolve(data);
        });
      }).on('error', (err) => {
        reject(err);
      });
    });
  }

  // Scrape a website using Firecrawl
  async scrapeWebsite(url, options = {}) {
    if (!this.firecrawlWrapper) {
      return {
        success: false,
        error: 'Firecrawl not configured. Add firecrawl_api_key to your config.json'
      };
    }

    try {
      console.log(`🔥 Scraping website: ${url}`);
      const result = await this.firecrawlWrapper.scrapeUrl(url, options);
      return result;
    } catch (error) {
      console.error('❌ Error scraping website:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Crawl a website using Firecrawl
  async crawlWebsite(url, options = {}) {
    if (!this.firecrawlWrapper) {
      return {
        success: false,
        error: 'Firecrawl not configured. Add firecrawl_api_key to your config.json'
      };
    }

    try {
      console.log(`🔥 Crawling website: ${url}`);
      const result = await this.firecrawlWrapper.crawlUrl(url, options);
      return result;
    } catch (error) {
      console.error('❌ Error crawling website:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Check if Firecrawl is configured
  isFirecrawlConfigured() {
    return !!this.firecrawlWrapper;
  }
}

export default WebSearcher;
