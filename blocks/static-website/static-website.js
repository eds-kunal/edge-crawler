export default async function decorate(block) {
  // Get the domain URL from block configuration
  const config = {};
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.children && row.children.length >= 2) {
      const key = row.children[0].textContent.trim().toLowerCase();
      const value = row.children[1].textContent.trim();
      config[key] = value;
    }
  });

  const targetDomain = config.domain || config.url || 'https://main--gattex--onetakeda.aem.live/';
  
  // Clear the block content
  block.innerHTML = '';
  
  // Create the UI
  const container = document.createElement('div');
  container.className = 'crawler-container';
  
  const header = document.createElement('div');
  header.className = 'crawler-header';
  header.innerHTML = `
    <h3>Website Crawler</h3>
    <p>Target Domain: <strong>${targetDomain}</strong></p>
    <button class="start-crawl-btn">Start Crawling</button>
  `;
  
  const progressContainer = document.createElement('div');
  progressContainer.className = 'crawler-progress';
  progressContainer.style.display = 'none';
  progressContainer.innerHTML = `
    <div class="progress-info">
      <span class="pages-found">Pages Found: 0</span>
      <span class="pages-processed">Pages Processed: 0</span>
      <span class="current-status">Ready to start</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill"></div>
    </div>
  `;
  
  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'crawler-results';
  resultsContainer.style.display = 'none';
  
  container.appendChild(header);
  container.appendChild(progressContainer);
  container.appendChild(resultsContainer);
  block.appendChild(container);
  
  // Crawler implementation
  class WebsiteCrawler {
    constructor(domain) {
      this.domain = this.normalizeDomain(domain);
      this.baseUrl = new URL(this.domain);
      this.internalLinks = new Set();
      this.externalLinks = new Set();
      this.visitedUrls = new Set();
      this.urlsToProcess = new Set();
      this.errors = [];
      this.isRunning = false;
    }
    
    normalizeDomain(domain) {
      if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
        domain = 'https://' + domain;
      }
      return domain.endsWith('/') ? domain.slice(0, -1) : domain;
    }
    
    isInternalUrl(url) {
      try {
        const urlObj = new URL(url, this.baseUrl);
        return urlObj.hostname === this.baseUrl.hostname;
      } catch (e) {
        return false;
      }
    }
    
    normalizeUrl(url) {
      try {
        const urlObj = new URL(url, this.baseUrl);
        // Remove fragments and common tracking parameters
        urlObj.hash = '';
        const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
        paramsToRemove.forEach(param => urlObj.searchParams.delete(param));
        return urlObj.toString();
      } catch (e) {
        return null;
      }
    }
    
    async fetchWithProxy(url) {
      // Try direct fetch first
      try {
        const response = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; WebsiteCrawler/1.0; +https://example.com/bot)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Cache-Control': 'no-cache'
          }
        });
        return response;
      } catch (corsError) {
        console.warn(`Direct fetch failed for ${url}, trying proxy:`, corsError.message);
        
        // If CORS fails, try alternative approaches
        const proxyServices = [
          `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
          `https://corsproxy.io/?${encodeURIComponent(url)}`
        ];
        
        for (const proxyUrl of proxyServices) {
          try {
            const proxyResponse = await fetch(proxyUrl);
            
            if (proxyUrl.includes('allorigins')) {
              const data = await proxyResponse.json();
              if (data.contents) {
                return {
                  ok: true,
                  text: () => Promise.resolve(data.contents),
                  status: data.status || 200,
                  headers: { get: () => 'text/html' }
                };
              }
            } else {
              if (proxyResponse.ok) {
                const text = await proxyResponse.text();
                return {
                  ok: true,
                  text: () => Promise.resolve(text),
                  status: proxyResponse.status,
                  headers: { get: () => 'text/html' }
                };
              }
            }
          } catch (proxyError) {
            console.warn(`Proxy ${proxyUrl} failed:`, proxyError.message);
          }
        }
        
        // If all else fails, return null
        return null;
      }
    }
    
    extractLinksFromHtml(html, baseUrl) {
      const links = new Set();
      
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Extract links from various sources
        const selectors = [
          'a[href]',
          'link[href][rel="canonical"]',
          'link[href][rel="alternate"]',
          'area[href]'
        ];
        
        selectors.forEach(selector => {
          doc.querySelectorAll(selector).forEach(element => {
            const url = element.getAttribute('href');
            if (url && !url.startsWith('#') && !url.startsWith('mailto:') && !url.startsWith('tel:')) {
              const normalizedUrl = this.normalizeUrl(url);
              if (normalizedUrl && normalizedUrl.startsWith('http')) {
                links.add(normalizedUrl);
              }
            }
          });
        });
        
        // Also check for URLs in script tags (JSON-LD, etc.)
        doc.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
          try {
            const jsonData = JSON.parse(script.textContent);
            this.extractUrlsFromObject(jsonData, links);
          } catch (e) {
            // Ignore invalid JSON
          }
        });
        
        // Check for URLs in meta tags
        doc.querySelectorAll('meta[property*="url"], meta[name*="url"]').forEach(meta => {
          const url = meta.getAttribute('content');
          if (url) {
            const normalizedUrl = this.normalizeUrl(url);
            if (normalizedUrl && normalizedUrl.startsWith('http')) {
              links.add(normalizedUrl);
            }
          }
        });
        
      } catch (e) {
        console.warn('Error parsing HTML:', e);
      }
      
      return links;
    }
    
    extractUrlsFromObject(obj, links) {
      if (typeof obj === 'string' && obj.startsWith('http')) {
        const normalizedUrl = this.normalizeUrl(obj);
        if (normalizedUrl) {
          links.add(normalizedUrl);
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(item => this.extractUrlsFromObject(item, links));
      } else if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(value => this.extractUrlsFromObject(value, links));
      }
    }
    
    async fetchSitemap(domain) {
      const sitemapUrls = [
        `${domain}/sitemap.xml`,
        `${domain}/sitemap_index.xml`,
        `${domain}/sitemaps.xml`,
        `${domain}/sitemap.txt`
      ];
      
      for (const sitemapUrl of sitemapUrls) {
        try {
          const response = await this.fetchWithProxy(sitemapUrl);
          if (response && response.ok) {
            const content = await response.text();
            const links = this.extractSitemapUrls(content);
            links.forEach(link => {
              const normalized = this.normalizeUrl(link);
              if (normalized && this.isInternalUrl(normalized)) {
                this.urlsToProcess.add(normalized);
              }
            });
            console.log(`Found ${links.size} URLs in sitemap: ${sitemapUrl}`);
            return true;
          }
        } catch (e) {
          console.warn(`Failed to fetch sitemap ${sitemapUrl}:`, e);
        }
      }
      return false;
    }
    
    extractSitemapUrls(xml) {
      const urls = new Set();
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');
      
      // Handle XML sitemaps
      doc.querySelectorAll('loc').forEach(loc => {
        const url = loc.textContent.trim();
        if (url) urls.add(url);
      });
      
      // Handle text sitemaps
      if (urls.size === 0) {
        xml.split('\n').forEach(line => {
          const url = line.trim();
          if (url && url.startsWith('http')) {
            urls.add(url);
          }
        });
      }
      
      return urls;
    }
    
    async crawlPage(url) {
      if (this.visitedUrls.has(url)) return;
      
      this.visitedUrls.add(url);
      this.updateProgress(`Processing: ${url}`);
      
      try {
        const response = await this.fetchWithProxy(url);
        
        if (!response) {
          this.errors.push(`Failed to fetch: ${url} (CORS/Network error)`);
          return;
        }
        
        if (!response.ok) {
          this.errors.push(`HTTP ${response.status}: ${url}`);
          return;
        }
        
        const contentType = response.headers ? response.headers.get('content-type') : '';
        if (contentType && !contentType.includes('text/html')) {
          return; // Skip non-HTML content
        }
        
        const html = await response.text();
        const links = this.extractLinksFromHtml(html, url);
        
        links.forEach(link => {
          if (this.isInternalUrl(link)) {
            this.internalLinks.add(link);
            if (!this.visitedUrls.has(link)) {
              this.urlsToProcess.add(link);
            }
          } else {
            this.externalLinks.add(link);
          }
        });
        
      } catch (error) {
        this.errors.push(`Error processing ${url}: ${error.message}`);
      }
    }
    
    updateProgress(status) {
      const statusEl = container.querySelector('.current-status');
      const pagesFoundEl = container.querySelector('.pages-found');
      const pagesProcessedEl = container.querySelector('.pages-processed');
      
      if (statusEl) statusEl.textContent = status;
      if (pagesFoundEl) pagesFoundEl.textContent = `Pages Found: ${this.internalLinks.size}`;
      if (pagesProcessedEl) pagesProcessedEl.textContent = `Pages Processed: ${this.visitedUrls.size}`;
    }
    
    async start() {
      if (this.isRunning) return;
      this.isRunning = true;
      
      // Show progress
      progressContainer.style.display = 'block';
      
      // Start with the main domain
      this.urlsToProcess.add(this.domain);
      
      // Try to get URLs from sitemap first
      await this.fetchSitemap(this.domain);
      
      const maxPages = 100; // Limit to prevent infinite crawling
      let processedCount = 0;
      
      while (this.urlsToProcess.size > 0 && processedCount < maxPages && this.isRunning) {
        const urlsToProcessNow = Array.from(this.urlsToProcess).slice(0, 5); // Process 5 at a time
        this.urlsToProcess.clear();
        
        const promises = urlsToProcessNow.map(url => this.crawlPage(url));
        await Promise.allSettled(promises);
        
        processedCount += urlsToProcessNow.length;
        
        // Add a small delay to be respectful
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      this.isRunning = false;
      this.displayResults();
    }
    
    stop() {
      this.isRunning = false;
    }
    
    displayResults() {
      resultsContainer.style.display = 'block';
      
      const internalLinksArray = Array.from(this.internalLinks).sort();
      const externalLinksArray = Array.from(this.externalLinks).sort();
      
      resultsContainer.innerHTML = `
        <div class="results-summary">
          <h4>Crawling Complete</h4>
          <div class="stats">
            <div class="stat-item">
              <span class="stat-number">${internalLinksArray.length}</span>
              <span class="stat-label">Internal Pages</span>
            </div>
            <div class="stat-item">
              <span class="stat-number">${externalLinksArray.length}</span>
              <span class="stat-label">External Links</span>
            </div>
            <div class="stat-item">
              <span class="stat-number">${this.errors.length}</span>
              <span class="stat-label">Errors</span>
            </div>
          </div>
        </div>
        
        <div class="results-sections">
          <div class="result-section">
            <h5>Internal Pages (${internalLinksArray.length})</h5>
            <div class="links-container">
              ${internalLinksArray.map(link => `
                <div class="link-item internal">
                  <a href="${link}" target="_blank" rel="noopener">${link}</a>
                </div>
              `).join('')}
            </div>
          </div>
          
          <div class="result-section">
            <h5>External Links (${externalLinksArray.length > 50 ? '50+' : externalLinksArray.length})</h5>
            <div class="links-container">
              ${externalLinksArray.slice(0, 50).map(link => `
                <div class="link-item external">
                  <a href="${link}" target="_blank" rel="noopener">${link}</a>
                </div>
              `).join('')}
              ${externalLinksArray.length > 50 ? '<div class="link-item">... and more</div>' : ''}
            </div>
          </div>
          
          ${this.errors.length > 0 ? `
            <div class="result-section">
              <h5>Errors (${this.errors.length})</h5>
              <div class="errors-container">
                ${this.errors.slice(0, 20).map(error => `
                  <div class="error-item">${error}</div>
                `).join('')}
                ${this.errors.length > 20 ? '<div class="error-item">... and more</div>' : ''}
              </div>
            </div>
          ` : ''}
        </div>
        
        <div class="export-section">
          <button class="export-btn" data-type="internal">Export Internal URLs</button>
          <button class="export-btn" data-type="external">Export External URLs</button>
          <button class="export-btn" data-type="all">Export All Data</button>
        </div>
      `;
      
      // Add export functionality
      resultsContainer.querySelectorAll('.export-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.type;
          let data = '';
          let filename = '';
          
          if (type === 'internal') {
            data = internalLinksArray.join('\n');
            filename = 'internal-urls.txt';
          } else if (type === 'external') {
            data = externalLinksArray.join('\n');
            filename = 'external-urls.txt';
          } else if (type === 'all') {
            data = JSON.stringify({
              domain: this.domain,
              crawledAt: new Date().toISOString(),
              internal: internalLinksArray,
              external: externalLinksArray,
              errors: this.errors
            }, null, 2);
            filename = 'crawl-results.json';
          }
          
          this.downloadFile(data, filename);
        });
      });
    }
    
    downloadFile(content, filename) {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  }
  
  // Initialize crawler
  let crawler = null;
  
  // Event handlers
  header.querySelector('.start-crawl-btn').addEventListener('click', async () => {
    const btn = header.querySelector('.start-crawl-btn');
    
    if (!crawler || !crawler.isRunning) {
      btn.textContent = 'Stop Crawling';
      btn.style.backgroundColor = '#d73502';
      resultsContainer.style.display = 'none';
      
      crawler = new WebsiteCrawler(targetDomain);
      await crawler.start();
      
      btn.textContent = 'Start Crawling';
      btn.style.backgroundColor = '';
    } else {
      crawler.stop();
      btn.textContent = 'Start Crawling';
      btn.style.backgroundColor = '';
    }
  });
}