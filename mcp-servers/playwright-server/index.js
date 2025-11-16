/**
 * Playwright MCP Server for NeuraLaunch
 * Provides browser automation capabilities via Model Context Protocol
 *
 * Capabilities:
 * - Screenshot websites
 * - Navigate and interact with pages
 * - Form filling and testing
 * - Deployment verification
 * - Web scraping
 * - Accessibility testing
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { chromium, firefox, webkit } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3100;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Browser pool
let browserPool = {
  chromium: null,
  firefox: null,
  webkit: null
};

// Initialize browsers on startup
async function initializeBrowsers() {
  try {
    console.log('🚀 Initializing browsers...');
    browserPool.chromium = await chromium.launch({ headless: true });
    console.log('✅ Chromium initialized');

    // Firefox and Webkit are optional
    try {
      browserPool.firefox = await firefox.launch({ headless: true });
      console.log('✅ Firefox initialized');
    } catch (err) {
      console.warn('⚠️  Firefox not available:', err.message);
    }

    try {
      browserPool.webkit = await webkit.launch({ headless: true });
      console.log('✅ WebKit initialized');
    } catch (err) {
      console.warn('⚠️  WebKit not available:', err.message);
    }
  } catch (error) {
    console.error('❌ Failed to initialize browsers:', error);
    throw error;
  }
}

// Cleanup browsers on shutdown
async function cleanupBrowsers() {
  console.log('🧹 Cleaning up browsers...');
  for (const [name, browser] of Object.entries(browserPool)) {
    if (browser) {
      await browser.close();
      console.log(`✅ ${name} closed`);
    }
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    browsers: {
      chromium: browserPool.chromium ? 'available' : 'unavailable',
      firefox: browserPool.firefox ? 'available' : 'unavailable',
      webkit: browserPool.webkit ? 'available' : 'unavailable'
    }
  };
  res.json(health);
});

// MCP endpoint - handles all browser automation requests
app.post('/mcp', async (req, res) => {
  try {
    const { tool, arguments: args } = req.body;

    if (!tool) {
      return res.status(400).json({ error: 'Tool name is required' });
    }

    console.log(`🔧 Executing tool: ${tool}`);

    // Route to appropriate handler
    let result;
    switch (tool) {
      case 'screenshot':
        result = await handleScreenshot(args);
        break;
      case 'navigate':
        result = await handleNavigate(args);
        break;
      case 'scrape':
        result = await handleScrape(args);
        break;
      case 'fill_form':
        result = await handleFillForm(args);
        break;
      case 'click':
        result = await handleClick(args);
        break;
      case 'get_text':
        result = await handleGetText(args);
        break;
      case 'verify_deployment':
        result = await handleVerifyDeployment(args);
        break;
      default:
        return res.status(400).json({ error: `Unknown tool: ${tool}` });
    }

    res.json({
      success: true,
      tool,
      result
    });
  } catch (error) {
    console.error('❌ Error executing tool:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Tool Handlers

async function handleScreenshot(args) {
  const { url, fullPage = true, browser = 'chromium' } = args;

  if (!url) throw new Error('URL is required');

  const browserInstance = browserPool[browser] || browserPool.chromium;
  if (!browserInstance) throw new Error('No browser available');

  const context = await browserInstance.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const screenshot = await page.screenshot({
      fullPage,
      type: 'png'
    });

    return {
      screenshot: screenshot.toString('base64'),
      url,
      timestamp: new Date().toISOString()
    };
  } finally {
    await context.close();
  }
}

async function handleNavigate(args) {
  const { url, browser = 'chromium', waitFor } = args;

  if (!url) throw new Error('URL is required');

  const browserInstance = browserPool[browser] || browserPool.chromium;
  if (!browserInstance) throw new Error('No browser available');

  const context = await browserInstance.newContext();
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    if (waitFor) {
      await page.waitForSelector(waitFor, { timeout: 10000 });
    }

    const title = await page.title();
    const finalUrl = page.url();

    return {
      title,
      url: finalUrl,
      success: true
    };
  } finally {
    await context.close();
  }
}

async function handleScrape(args) {
  const { url, selector, browser = 'chromium' } = args;

  if (!url) throw new Error('URL is required');

  const browserInstance = browserPool[browser] || browserPool.chromium;
  if (!browserInstance) throw new Error('No browser available');

  const context = await browserInstance.newContext();
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    let content;
    if (selector) {
      content = await page.textContent(selector);
    } else {
      content = await page.content();
    }

    return {
      content,
      url,
      selector
    };
  } finally {
    await context.close();
  }
}

async function handleFillForm(args) {
  const { url, fields, submitSelector, browser = 'chromium' } = args;

  if (!url || !fields) throw new Error('URL and fields are required');

  const browserInstance = browserPool[browser] || browserPool.chromium;
  if (!browserInstance) throw new Error('No browser available');

  const context = await browserInstance.newContext();
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Fill each field
    for (const [selector, value] of Object.entries(fields)) {
      await page.fill(selector, value);
    }

    // Submit if selector provided
    if (submitSelector) {
      await page.click(submitSelector);
      await page.waitForLoadState('networkidle');
    }

    return {
      success: true,
      finalUrl: page.url()
    };
  } finally {
    await context.close();
  }
}

async function handleClick(args) {
  const { url, selector, waitForNavigation = false, browser = 'chromium' } = args;

  if (!url || !selector) throw new Error('URL and selector are required');

  const browserInstance = browserPool[browser] || browserPool.chromium;
  if (!browserInstance) throw new Error('No browser available');

  const context = await browserInstance.newContext();
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.click(selector);

    if (waitForNavigation) {
      await page.waitForLoadState('networkidle');
    }

    return {
      success: true,
      finalUrl: page.url()
    };
  } finally {
    await context.close();
  }
}

async function handleGetText(args) {
  const { url, selector, browser = 'chromium' } = args;

  if (!url || !selector) throw new Error('URL and selector are required');

  const browserInstance = browserPool[browser] || browserPool.chromium;
  if (!browserInstance) throw new Error('No browser available');

  const context = await browserInstance.newContext();
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const text = await page.textContent(selector);

    return {
      text,
      selector,
      url
    };
  } finally {
    await context.close();
  }
}

async function handleVerifyDeployment(args) {
  const { url, expectedText, expectedTitle, browser = 'chromium' } = args;

  if (!url) throw new Error('URL is required');

  const browserInstance = browserPool[browser] || browserPool.chromium;
  if (!browserInstance) throw new Error('No browser available');

  const context = await browserInstance.newContext();
  const page = await context.newPage();

  try {
    const startTime = Date.now();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const loadTime = Date.now() - startTime;

    const title = await page.title();
    const content = await page.content();

    const checks = {
      accessible: true,
      loadTime,
      title,
      titleMatch: expectedTitle ? title.includes(expectedTitle) : null,
      contentMatch: expectedText ? content.includes(expectedText) : null
    };

    return {
      url,
      verified: true,
      checks,
      screenshot: (await page.screenshot({ type: 'png' })).toString('base64')
    };
  } catch (error) {
    return {
      url,
      verified: false,
      error: error.message
    };
  } finally {
    await context.close();
  }
}

// Start server
async function start() {
  try {
    await initializeBrowsers();

    app.listen(PORT, () => {
      console.log(`
🚀 Playwright MCP Server Running!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Port: ${PORT}
🌐 Health: http://localhost:${PORT}/health
🔧 MCP Endpoint: http://localhost:${PORT}/mcp
🎭 Browsers: ${Object.entries(browserPool).filter(([_, b]) => b).map(([n]) => n).join(', ')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('📊 SIGTERM received, shutting down gracefully...');
  await cleanupBrowsers();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📊 SIGINT received, shutting down gracefully...');
  await cleanupBrowsers();
  process.exit(0);
});

// Start the server
start();
