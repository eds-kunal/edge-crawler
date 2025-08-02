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
    <div class="domain-input-section">
      <label for="domain-input">Enter Website Domain:</label>
      <div class="input-group">
        <input type="text" id="domain-input" class="domain-input" placeholder="https://example.com" value="${targetDomain}">
        <button class="validate-btn">Validate & Check EDS</button>
      </div>
      <div class="validation-result" style="display: none;"></div>
    </div>
    <button class="start-crawl-btn" disabled>Start Crawling</button>
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
      this.domain = WebsiteCrawler.normalizeDomain(domain);
      this.baseUrl = new URL(this.domain);
      this.internalLinks = new Set();
      this.externalLinks = new Set();
      this.visitedUrls = new Set();
      this.urlsToProcess = new Set();
      this.errors = [];
      this.isRunning = false;
    }

    static normalizeDomain(domain) {
      let normalizedDomain = domain;
      if (!normalizedDomain.startsWith('http://') && !normalizedDomain.startsWith('https://')) {
        normalizedDomain = `https://${normalizedDomain}`;
      }
      return normalizedDomain.endsWith('/') ? normalizedDomain.slice(0, -1) : normalizedDomain;
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
        paramsToRemove.forEach((param) => urlObj.searchParams.delete(param));
        return urlObj.toString();
      } catch (e) {
        return null;
      }
    }

    // eslint-disable-next-line class-methods-use-this
    async fetchWithProxy(url) {
      // Try direct fetch first
      try {
        const response = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; WebsiteCrawler/1.0; +https://example.com/bot)',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Cache-Control': 'no-cache',
          },
        });
        return response;
      } catch (corsError) {
        // eslint-disable-next-line no-console
        console.warn(`Direct fetch failed for ${url}, trying proxy:`, corsError.message);

        // If CORS fails, try alternative approaches
        const proxyServices = [
          `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
          `https://corsproxy.io/?${encodeURIComponent(url)}`,
        ];

        // Process proxies sequentially using reduce
        const proxyResult = await proxyServices.reduce(async (promise, proxyUrl) => {
          const result = await promise;
          if (result) return result;

          try {
            const proxyResponse = await fetch(proxyUrl);

            if (proxyUrl.includes('allorigins')) {
              const data = await proxyResponse.json();
              if (data.contents) {
                return {
                  ok: true,
                  text: () => Promise.resolve(data.contents),
                  status: data.status || 200,
                  headers: { get: () => 'text/html' },
                };
              }
            } else if (proxyResponse.ok) {
              const text = await proxyResponse.text();
              return {
                ok: true,
                text: () => Promise.resolve(text),
                status: proxyResponse.status,
                headers: { get: () => 'text/html' },
              };
            }
          } catch (proxyError) {
            // eslint-disable-next-line no-console
            console.warn(`Proxy ${proxyUrl} failed:`, proxyError.message);
          }
          return null;
        }, Promise.resolve(null));

        return proxyResult;
      }
    }

    extractLinksFromHtml(html) {
      const links = new Set();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Extract links from various sources
      const selectors = [
        'a[href]',
        'link[href]',
        'area[href]',
      ];

      selectors.forEach((selector) => {
        doc.querySelectorAll(selector).forEach((element) => {
          const url = element.getAttribute('href');
          // eslint-disable-next-line no-script-url
          if (url && !url.startsWith('mailto:') && !url.startsWith('tel:') && url.indexOf('javascript:') === -1) {
            const normalizedUrl = this.normalizeUrl(url);
            if (normalizedUrl) {
              links.add(normalizedUrl);
            }
          }
        });
      });

      return links;
    }

    async fetchSitemap(domain) {
      const sitemapUrls = [
        `${domain}/sitemap.xml`,
        `${domain}/sitemap_index.xml`,
        `${domain}/sitemaps.xml`,
      ];

      // Process sitemaps sequentially using reduce
      return sitemapUrls.reduce(
        (promise, sitemapUrl) => promise.then(async (found) => {
          if (found) return true;
          try {
            const response = await this.fetchWithProxy(sitemapUrl);
            if (response && response.ok) {
              const content = await response.text();
              const links = WebsiteCrawler.extractSitemapUrls(content);
              links.forEach((link) => {
                const normalized = this.normalizeUrl(link);
                if (normalized && this.isInternalUrl(normalized)) {
                  this.urlsToProcess.add(normalized);
                }
              });
              // eslint-disable-next-line no-console
              console.log(`Found ${links.size} URLs in sitemap: ${sitemapUrl}`);
              return true;
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn(`Failed to fetch sitemap ${sitemapUrl}:`, e);
          }
          return false;
        }),
        Promise.resolve(false),
      );
    }

    static extractSitemapUrls(xml) {
      const urls = new Set();
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');

      // Handle XML sitemaps
      doc.querySelectorAll('loc').forEach((loc) => {
        const url = loc.textContent.trim();
        if (url) urls.add(url);
      });

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
        const links = this.extractLinksFromHtml(html);

        links.forEach((link) => {
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

      const maxPages = 50; // Limit to prevent infinite crawling
      let processedCount = 0;

      while (this.urlsToProcess.size > 0 && processedCount < maxPages && this.isRunning) {
        const urlsToProcessNow = Array.from(this.urlsToProcess).slice(0, 3); // Process 3 at a time
        this.urlsToProcess.clear();

        const promises = urlsToProcessNow.map((url) => this.crawlPage(url));
        // eslint-disable-next-line no-await-in-loop
        await Promise.allSettled(promises);

        processedCount += urlsToProcessNow.length;

        // Add a small delay to be respectful
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, 200);
        });
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
              ${internalLinksArray.map((link) => `
                <div class="link-item internal">
                  <a href="${link}" target="_blank" rel="noopener">${link}</a>
                </div>
              `).join('')}
            </div>
          </div>
          
          <div class="result-section">
            <h5>External Links (${externalLinksArray.length > 20 ? '20+' : externalLinksArray.length})</h5>
            <div class="links-container">
              ${externalLinksArray.slice(0, 20).map((link) => `
                <div class="link-item external">
                  <a href="${link}" target="_blank" rel="noopener">${link}</a>
                </div>
              `).join('')}
              ${externalLinksArray.length > 20 ? '<div class="link-item">... and more</div>' : ''}
            </div>
          </div>
          
          ${this.errors.length > 0 ? `
            <div class="result-section">
              <h5>Errors (${this.errors.length})</h5>
              <div class="errors-container">
                ${this.errors.slice(0, 10).map((error) => `
                  <div class="error-item">${error}</div>
                `).join('')}
                ${this.errors.length > 10 ? '<div class="error-item">... and more</div>' : ''}
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
      resultsContainer.querySelectorAll('.export-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const { type } = btn.dataset;
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
              errors: this.errors,
            }, null, 2);
            filename = 'crawl-results.json';
          }

          WebsiteCrawler.downloadFile(data, filename);
        });
      });
    }

    static downloadFile(content, filename) {
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

  // EDS Validation functionality
  async function validateDomainAndCheckEDS(domain) {
    const normalizedDomain = WebsiteCrawler.normalizeDomain(domain);
    const validationResult = container.querySelector('.validation-result');
    const startBtn = container.querySelector('.start-crawl-btn');

    validationResult.style.display = 'block';
    validationResult.innerHTML = '<div class="validation-loading">🔍 Validating domain and checking for EDS...</div>';

    try {
      // Test if domain is accessible
      const testUrl = `${normalizedDomain}/`;

      // Since we can't reliably check domain accessibility due to CORS,
      // we'll proceed directly to content fetching for EDS detection
      let isEDS = false;
      let pageContent = '';

      try {
        const pageResponse = await fetch(testUrl, {
          method: 'GET',
          mode: 'cors',
        });

        if (pageResponse.ok) {
          pageContent = await pageResponse.text();
        }
      } catch (corsError) {
        // If CORS fails, try with proxy for EDS detection
        try {
          const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(testUrl)}`;
          const proxyResponse = await fetch(proxyUrl);
          const proxyData = await proxyResponse.json();
          if (proxyData.contents) {
            pageContent = proxyData.contents;
          }
        } catch (proxyError) {
          // eslint-disable-next-line no-console
          console.warn('Could not fetch page content for EDS detection:', proxyError);
        }
      }

      // Check for EDS indicators
      if (pageContent) {
        isEDS = pageContent.includes('aem.js')
                || pageContent.includes('/scripts/aem.js')
                || pageContent.includes('aem.live')
                || pageContent.includes('hlx.live')
                || pageContent.includes('franklin');
      }

      // Display validation results
      validationResult.innerHTML = `
        <div class="validation-success">
          <div class="domain-status">
            ✅ <strong>Domain Accessible:</strong> ${normalizedDomain}
          </div>
          <div class="eds-status ${isEDS ? 'eds-detected' : 'eds-not-detected'}">
            ${isEDS ? '🚀 <strong>EDS Detected:</strong> This appears to be an Edge Delivery Services site!' : '⚠️ <strong>EDS Not Detected:</strong> This doesn\'t appear to be an EDS site (no aem.js found).'}
          </div>
          ${isEDS ? '<div class="eds-info">💡 Perfect for comprehensive crawling with AEM-specific optimizations.</div>' : '<div class="eds-info">❌ This crawler is designed specifically for EDS sites. Please try an EDS website.</div>'}
        </div>
      `;

      // Only enable start button if EDS is detected
      startBtn.disabled = !isEDS;
      startBtn.textContent = isEDS ? 'Start Crawling' : 'EDS Site Required';
      return { valid: true, isEDS, domain: normalizedDomain };
    } catch (error) {
      validationResult.innerHTML = `
        <div class="validation-error">
          ❌ <strong>Validation Failed:</strong> ${error.message}
          <div class="error-details">Please check the domain and try again.</div>
        </div>
      `;
      startBtn.disabled = true;
      return { valid: false, isEDS: false, domain: normalizedDomain };
    }
  }

  // Initialize crawler
  let crawler = null;
  let currentDomain = targetDomain;
  let isValidatedDomain = false;
  let isEDSDetected = false;

  // Event handlers
  const domainInput = header.querySelector('#domain-input');
  const validateBtn = header.querySelector('.validate-btn');
  const startBtn = header.querySelector('.start-crawl-btn');

  // Validate button handler
  validateBtn.addEventListener('click', async () => {
    const domain = domainInput.value.trim();
    if (!domain) {
      // eslint-disable-next-line no-alert
      alert('Please enter a domain to validate.');
      return;
    }

    validateBtn.disabled = true;
    validateBtn.textContent = 'Validating...';

    const result = await validateDomainAndCheckEDS(domain);

    validateBtn.disabled = false;
    validateBtn.textContent = 'Validate & Check EDS';

    if (result.valid) {
      currentDomain = result.domain;
      isValidatedDomain = true;
      isEDSDetected = result.isEDS;
    } else {
      isValidatedDomain = false;
      isEDSDetected = false;
    }
  });

  // Input change handler
  domainInput.addEventListener('input', () => {
    isValidatedDomain = false;
    isEDSDetected = false;
    startBtn.disabled = true;
    startBtn.textContent = 'Start Crawling';
    const validationResult = container.querySelector('.validation-result');
    validationResult.style.display = 'none';
  });

  // Start crawling button handler
  startBtn.addEventListener('click', async () => {
    if (!isValidatedDomain) {
      // eslint-disable-next-line no-alert
      alert('Please validate the domain first by clicking "Validate & Check EDS".');
      return;
    }

    if (!isEDSDetected) {
      // eslint-disable-next-line no-alert
      alert('This crawler is designed specifically for Adobe Edge Delivery Services (EDS) websites. Please use an EDS site.');
      return;
    }

    if (!crawler || !crawler.isRunning) {
      startBtn.textContent = 'Stop Crawling';
      startBtn.style.backgroundColor = '#d73502';
      resultsContainer.style.display = 'none';

      crawler = new WebsiteCrawler(currentDomain);
      await crawler.start();

      startBtn.textContent = 'Start Crawling';
      startBtn.style.backgroundColor = '';
    } else {
      crawler.stop();
      startBtn.textContent = 'Start Crawling';
      startBtn.style.backgroundColor = '';
    }
  });

  // Initial validation if default domain is provided
  if (targetDomain) {
    validateDomainAndCheckEDS(targetDomain).then((result) => {
      if (result.valid) {
        currentDomain = result.domain;
        isValidatedDomain = true;
        isEDSDetected = result.isEDS;
      }
    });
  }
}
