# Static Website Crawler Block

A comprehensive EDS (Edge Delivery Services) block that crawls websites to discover all internal and external URLs. Perfect for site audits, link analysis, SEO purposes, and website migration planning.

## Features

- **🔍 Comprehensive Discovery**: Finds URLs from HTML content, sitemaps, and structured data
- **🎯 Smart Filtering**: Automatically separates internal pages from external links
- **🔧 CORS Handling**: Uses fallback proxy services when direct access is blocked
- **📊 Export Capabilities**: Download results as text or JSON files
- **⚡ Rate Limiting**: Respectful crawling with configurable delays
- **📝 Error Tracking**: Comprehensive reporting of failed requests
- **📱 Responsive Design**: Works on desktop and mobile devices

## Installation

1. Copy the `static-website` folder from `blocks/` to your EDS project's `blocks/` directory
2. The block will be automatically available for use in your pages

## Usage

### Basic Usage

Add the block to your page using standard EDS block format:

```html
<div class="static-website">
    <div>
        <div>Domain</div>
        <div>https://example.com</div>
    </div>
</div>
```

### Configuration Options

The block accepts the following configuration parameters:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `Domain` | The website URL to crawl (required) | `https://example.com` |
| `URL` | Alternative parameter name for domain | `https://example.com` |

### Example Configurations

#### Basic Domain Crawling
```html
<div class="static-website">
    <div>
        <div>Domain</div>
        <div>https://main--gattex--onetakeda.aem.live/</div>
    </div>
</div>
```

#### Using URL Parameter
```html
<div class="static-website">
    <div>
        <div>URL</div>
        <div>https://www.adobe.com</div>
    </div>
</div>
```

## How It Works

The crawler operates in the following sequence:

1. **Initialization**: Parses the target domain from block configuration
2. **Sitemap Discovery**: Attempts to fetch and parse `sitemap.xml`, `sitemap_index.xml`, and `sitemaps.xml`
3. **Page Crawling**: Crawls each discovered page to extract all links
4. **Link Extraction**: Finds links from `<a>`, `<link>`, and `<area>` elements
5. **Categorization**: Separates URLs into internal (same domain) and external links
6. **Recursive Discovery**: Follows internal links to discover more pages (with safety limits)
7. **Results Display**: Shows comprehensive results with export options

## Technical Implementation

### CORS Handling

Due to browser security restrictions, many websites cannot be crawled directly. The block includes multiple fallback mechanisms:

1. **Direct Fetch**: Attempts a standard CORS request first
2. **Proxy Services**: Falls back to public CORS proxy services:
   - `https://api.allorigins.win/`
   - `https://corsproxy.io/`

### Rate Limiting

The crawler implements respectful crawling practices:
- Processes a maximum of 3 pages simultaneously
- Includes 200ms delays between batches
- Limits total pages crawled to 50 per session

### URL Normalization

The crawler normalizes URLs by:
- Removing URL fragments (`#section`)
- Stripping tracking parameters (`utm_*`, `fbclid`, `gclid`)
- Converting relative URLs to absolute URLs
- Filtering out non-HTTP protocols (`javascript:`, `mailto:`, `tel:`)

## Export Options

The block provides three export formats:

1. **Internal URLs**: Plain text file with all internal page URLs
2. **External URLs**: Plain text file with all external link URLs  
3. **Complete Data**: JSON file with comprehensive crawl results including:
   - Domain information
   - Crawl timestamp
   - Internal URLs array
   - External URLs array
   - Error log

### JSON Export Format

```json
{
  "domain": "https://example.com",
  "crawledAt": "2025-08-02T10:30:00.000Z",
  "internal": [
    "https://example.com/",
    "https://example.com/about",
    "https://example.com/contact"
  ],
  "external": [
    "https://facebook.com/example",
    "https://twitter.com/example"
  ],
  "errors": [
    "HTTP 404: https://example.com/broken-link"
  ]
}
```

## Customization

### Styling

The block uses CSS custom properties that can be overridden:

```css
.static-website {
  --primary-color: #137333;
  --secondary-color: #1a73e8;
  --error-color: #d73502;
  --background-color: #f9f9f9;
  --border-radius: 8px;
}
```

### Limits Configuration

You can modify the crawler limits in the JavaScript file:

```javascript
const maxPages = 50; // Maximum pages to crawl
const batchSize = 3; // Concurrent requests
const delay = 200; // Delay between batches (ms)
```

## Browser Compatibility

- ✅ Chrome 80+
- ✅ Firefox 75+
- ✅ Safari 13+
- ✅ Edge 80+

## Limitations

1. **CORS Restrictions**: Some websites may block all crawling attempts
2. **Rate Limiting**: Respects robots.txt and implements conservative crawling
3. **JavaScript Content**: Only crawls static HTML content, not dynamically generated content
4. **Authentication**: Cannot crawl password-protected or authenticated pages

## Troubleshooting

### Common Issues

**Block doesn't load**
- Ensure the `static-website` folder is in your `blocks/` directory
- Check browser console for JavaScript errors
- Verify the block HTML structure follows EDS conventions

**CORS errors**
- This is expected for many websites
- The block automatically tries proxy services
- Some sites may still be uncrawlable due to strict security policies

**No results found**
- Check if the target domain is accessible
- Verify the domain URL format (include `https://`)
- Look for errors in the results section

## Development

### Local Testing

1. Start the AEM development server:
   ```bash
   aem up
   ```

2. Open `http://localhost:3000/` in your browser

3. Test the block with different domain configurations

### Adding Features

The block is designed to be extensible. Common enhancements include:

- Custom crawling rules
- Additional export formats
- Integration with analytics tools
- Bulk domain processing

## License

This block follows the same license as the parent EDS project.

## Contributing

Contributions are welcome! Please follow the established code style and include tests for new features.
