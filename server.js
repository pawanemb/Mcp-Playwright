import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { chromium, firefox, webkit } from 'playwright';
import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import TurndownService from 'turndown';

dotenv.config();

class SessionManager {
  constructor() {
    this.sessions = new Map(); // sessionId -> { browser, context, page, createdAt, lastUsed, config }
    this.pendingLaunches = new Map(); // sessionId -> Promise
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes
    this.cleanupInterval = 5 * 60 * 1000; // 5 minutes
    
    // Start periodic cleanup
    this.startCleanupTimer();
  }

  async getOrCreateSession(sessionId, config = {}) {
    // Check if session creation is already in progress
    if (this.pendingLaunches.has(sessionId)) {
      console.log(`⏳ Session ${sessionId} creation in progress, waiting...`);
      return await this.pendingLaunches.get(sessionId);
    }

    // Check if session already exists and is valid
    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId);
      if (await this.validateSession(session)) {
        session.lastUsed = Date.now();
        console.log(`♻️ Reusing existing session: ${sessionId}`);
        return session;
      } else {
        console.log(`🗑️ Session ${sessionId} invalid, cleaning up and recreating`);
        await this.cleanupSession(sessionId);
      }
    }

    // Create new session with locking
    console.log(`🚀 Creating new session: ${sessionId}`);
    const launchPromise = this.createSession(sessionId, config);
    this.pendingLaunches.set(sessionId, launchPromise);

    try {
      const session = await launchPromise;
      this.sessions.set(sessionId, session);
      console.log(`✅ Session ${sessionId} created successfully`);
      return session;
    } catch (error) {
      console.error(`❌ Failed to create session ${sessionId}:`, error.message);
      throw error;
    } finally {
      this.pendingLaunches.delete(sessionId);
    }
  }

  async createSession(sessionId, config) {
    const { browserType = 'chromium', headless = true, ...otherConfig } = config;
    
    let browser, context, page;
    
    try {
      // Launch browser
      const browserClass = browserType === 'firefox' ? firefox : 
                          browserType === 'webkit' ? webkit : chromium;
      
      browser = await browserClass.launch({ 
        headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        ...otherConfig
      });

      // Create context
      context = await browser.newContext();
      
      // Create page
      page = await context.newPage();

      const now = Date.now();
      return {
        sessionId,
        browser,
        context, 
        page,
        createdAt: now,
        lastUsed: now,
        config: { browserType, headless, ...otherConfig }
      };
    } catch (error) {
      // Cleanup any partially created resources
      try {
        if (context) await context.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
      } catch (cleanupError) {
        console.error(`Cleanup error for session ${sessionId}:`, cleanupError.message);
      }
      throw new Error(`Failed to create session ${sessionId}: ${error.message}`);
    }
  }

  async validateSession(session) {
    if (!session || !session.page || !session.browser) {
      return false;
    }

    try {
      // Check if browser is still connected
      if (!session.browser.isConnected()) {
        console.log(`🔌 Browser disconnected for session ${session.sessionId}`);
        return false;
      }

      // Check if page is still accessible
      await session.page.evaluate('1+1');
      return true;
    } catch (error) {
      console.log(`💀 Session ${session.sessionId} validation failed:`, error.message);
      return false;
    }
  }

  async getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    
    if (await this.validateSession(session)) {
      session.lastUsed = Date.now();
      return session;
    } else {
      await this.cleanupSession(sessionId);
      return null;
    }
  }

  async cleanupSession(sessionId, force = false) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    console.log(`🗑️ Cleaning up session: ${sessionId}`);
    
    try {
      // Close page first
      if (session.page && !session.page.isClosed()) {
        await session.page.close().catch(e => console.log(`Page close error: ${e.message}`));
      }
      
      // Close context
      if (session.context) {
        await session.context.close().catch(e => console.log(`Context close error: ${e.message}`));
      }
      
      // Close browser
      if (session.browser && session.browser.isConnected()) {
        await session.browser.close().catch(e => console.log(`Browser close error: ${e.message}`));
      }
    } catch (error) {
      console.error(`Error during cleanup of session ${sessionId}:`, error.message);
    } finally {
      // Always remove from sessions map
      this.sessions.delete(sessionId);
      console.log(`✅ Session ${sessionId} cleaned up`);
    }
  }

  startCleanupTimer() {
    setInterval(async () => {
      await this.cleanupExpiredSessions();
    }, this.cleanupInterval);
  }

  async cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions = [];

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastUsed > this.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    }

    if (expiredSessions.length > 0) {
      console.log(`🕐 Cleaning up ${expiredSessions.length} expired sessions`);
      for (const sessionId of expiredSessions) {
        await this.cleanupSession(sessionId);
      }
    }
  }

  async closeAllSessions() {
    console.log(`🗑️ Closing all ${this.sessions.size} sessions`);
    const cleanupPromises = Array.from(this.sessions.keys()).map(sessionId => 
      this.cleanupSession(sessionId)
    );
    await Promise.allSettled(cleanupPromises);
  }

  getSessionStats() {
    return {
      totalSessions: this.sessions.size,
      pendingLaunches: this.pendingLaunches.size,
      sessions: Array.from(this.sessions.values()).map(s => ({
        sessionId: s.sessionId,
        browserType: s.config.browserType,
        createdAt: new Date(s.createdAt).toISOString(),
        lastUsed: new Date(s.lastUsed).toISOString(),
        ageMinutes: Math.round((Date.now() - s.createdAt) / 60000)
      }))
    };
  }
}

class PlaywrightMCPServer {
  constructor() {
    this.sessionManager = new SessionManager();
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced'
    });
    this.server = new Server(
      {
        name: 'playwright-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    this.setupTools();
    
    // Cleanup sessions on exit
    process.on('SIGTERM', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
  }

  async cleanup() {
    console.log('🛑 Shutting down, cleaning up sessions...');
    await this.sessionManager.closeAllSessions();
    process.exit(0);
  }

  setupTools() {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'launch_browser',
          description: 'Launch a new browser instance',
          inputSchema: {
            type: 'object',
            properties: {
              browserType: {
                type: 'string',
                enum: ['chromium', 'firefox', 'webkit'],
                description: 'Type of browser to launch'
              },
              headless: {
                type: 'boolean',
                description: 'Run browser in headless mode',
                default: true
              },
              sessionId: {
                type: 'string',
                description: 'Unique session identifier'
              }
            },
            required: ['browserType', 'sessionId']
          }
        },
        {
          name: 'navigate',
          description: 'Navigate to a URL',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session identifier' },
              url: { type: 'string', description: 'URL to navigate to' }
            },
            required: ['sessionId', 'url']
          }
        },
        {
          name: 'screenshot',
          description: 'Take a screenshot of the current page',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session identifier' },
              fullPage: { type: 'boolean', description: 'Capture full page', default: false }
            },
            required: ['sessionId']
          }
        },
        {
          name: 'click',
          description: 'Click an element on the page',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session identifier' },
              selector: { type: 'string', description: 'CSS selector for the element' }
            },
            required: ['sessionId', 'selector']
          }
        },
        {
          name: 'fill',
          description: 'Fill an input field',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session identifier' },
              selector: { type: 'string', description: 'CSS selector for the input' },
              value: { type: 'string', description: 'Value to fill' }
            },
            required: ['sessionId', 'selector', 'value']
          }
        },
        {
          name: 'get_text',
          description: 'Get text content from an element',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session identifier' },
              selector: { type: 'string', description: 'CSS selector for the element' }
            },
            required: ['sessionId', 'selector']
          }
        },
        {
          name: 'evaluate',
          description: 'Execute JavaScript in the page context',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session identifier' },
              script: { type: 'string', description: 'JavaScript code to execute' }
            },
            required: ['sessionId', 'script']
          }
        },
        {
          name: 'get_html',
          description: 'Extract the HTML content of the current page',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session identifier' },
              selector: { type: 'string', description: 'CSS selector to extract specific element (optional, defaults to entire page)' }
            },
            required: ['sessionId']
          }
        },
        {
          name: 'get_markdown',
          description: 'Extract the HTML content and convert it to markdown',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session identifier' },
              selector: { type: 'string', description: 'CSS selector to extract specific element (optional, defaults to entire page)' }
            },
            required: ['sessionId']
          }
        },
        {
          name: 'close_browser',
          description: 'Close a browser session',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session identifier' }
            },
            required: ['sessionId']
          }
        }
      ]
    }));

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'launch_browser':
            return await this.launchBrowser(args);
          case 'navigate':
            return await this.navigate(args);
          case 'screenshot':
            return await this.screenshot(args);
          case 'click':
            return await this.click(args);
          case 'fill':
            return await this.fill(args);
          case 'get_text':
            return await this.getText(args);
          case 'evaluate':
            return await this.evaluate(args);
          case 'get_html':
            return await this.getHTML(args);
          case 'get_markdown':
            return await this.getMarkdown(args);
          case 'close_browser':
            return await this.closeBrowser(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }]
        };
      }
    });
  }

  async launchBrowser({ browserType = 'chromium', headless = true, sessionId, ...otherConfig }) {
    try {
      const session = await this.sessionManager.getOrCreateSession(sessionId, { 
        browserType, 
        headless, 
        ...otherConfig 
      });
      
      return {
        content: [{ 
          type: 'text', 
          text: `Browser launched successfully with session ID: ${sessionId} (${session.config.browserType})` 
        }]
      };
    } catch (error) {
      throw new Error(`Failed to launch browser: ${error.message}`);
    }
  }

  async navigate({ sessionId, url }) {
    const session = await this.sessionManager.getOrCreateSession(sessionId);
    
    try {
      await session.page.goto(url, { waitUntil: 'networkidle' });
      return {
        content: [{ type: 'text', text: `Navigated to ${url}` }]
      };
    } catch (error) {
      throw new Error(`Navigation failed: ${error.message}`);
    }
  }

  async screenshot({ sessionId, fullPage = false }) {
    const session = await this.sessionManager.getOrCreateSession(sessionId);
    
    try {
      const screenshot = await session.page.screenshot({ 
        fullPage,
        type: 'png',
        encoding: 'base64'
      });
      
      return {
        content: [
          { type: 'text', text: 'Screenshot taken' },
          { type: 'image', data: screenshot, mimeType: 'image/png' }
        ]
      };
    } catch (error) {
      throw new Error(`Screenshot failed: ${error.message}`);
    }
  }

  async click({ sessionId, selector }) {
    const session = await this.sessionManager.getOrCreateSession(sessionId);
    
    try {
      await session.page.click(selector);
      return {
        content: [{ type: 'text', text: `Clicked element: ${selector}` }]
      };
    } catch (error) {
      throw new Error(`Click failed: ${error.message}`);
    }
  }

  async fill({ sessionId, selector, value }) {
    const session = await this.sessionManager.getOrCreateSession(sessionId);
    
    try {
      await session.page.fill(selector, value);
      return {
        content: [{ type: 'text', text: `Filled ${selector} with value` }]
      };
    } catch (error) {
      throw new Error(`Fill failed: ${error.message}`);
    }
  }

  async getText({ sessionId, selector }) {
    const session = await this.sessionManager.getOrCreateSession(sessionId);
    
    try {
      const text = await session.page.textContent(selector);
      return {
        content: [{ type: 'text', text: text || 'No text found' }]
      };
    } catch (error) {
      throw new Error(`Get text failed: ${error.message}`);
    }
  }

  async evaluate({ sessionId, script }) {
    const session = await this.sessionManager.getOrCreateSession(sessionId);
    
    try {
      const result = await session.page.evaluate(script);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      };
    } catch (error) {
      throw new Error(`Script evaluation failed: ${error.message}`);
    }
  }

  async getHTML({ sessionId, selector }) {
    const session = await this.sessionManager.getOrCreateSession(sessionId);
    
    try {
      let html;
      if (selector) {
        // Get HTML of specific element
        const element = await session.page.$(selector);
        if (!element) {
          return {
            content: [{ type: 'text', text: `Element not found: ${selector}. Available elements: ${await this.getAvailableSelectors(session.page)}` }]
          };
        }
        html = await element.innerHTML();
      } else {
        // Get entire page HTML
        html = await session.page.content();
      }
      
      return {
        content: [{ type: 'text', text: html }]
      };
    } catch (error) {
      throw new Error(`Get HTML failed: ${error.message}`);
    }
  }

  async getMarkdown({ sessionId, selector }) {
    const session = await this.sessionManager.getOrCreateSession(sessionId);
    
    try {
      let html;
      if (selector) {
        // Get HTML of specific element
        const element = await session.page.$(selector);
        if (!element) {
          return {
            content: [{ type: 'text', text: `Element not found: ${selector}. Available elements: ${await this.getAvailableSelectors(session.page)}` }]
          };
        }
        html = await element.innerHTML();
      } else {
        // Get entire page HTML
        html = await session.page.content();
      }
      
      // Convert HTML to Markdown
      const markdown = this.turndown.turndown(html);
      
      return {
        content: [{ type: 'text', text: markdown }]
      };
    } catch (error) {
      throw new Error(`Get markdown failed: ${error.message}`);
    }
  }

  async getAvailableSelectors(page) {
    try {
      const selectors = await page.evaluate(() => {
        const elements = document.querySelectorAll('*');
        const tags = new Set();
        const classes = new Set();
        const ids = new Set();
        
        Array.from(elements).slice(0, 50).forEach(el => {
          if (el.tagName) tags.add(el.tagName.toLowerCase());
          if (el.className && typeof el.className === 'string') {
            el.className.split(' ').forEach(cls => {
              if (cls.trim()) classes.add('.' + cls.trim());
            });
          }
          if (el.id) ids.add('#' + el.id);
        });
        
        return {
          tags: Array.from(tags).slice(0, 20),
          classes: Array.from(classes).slice(0, 10),
          ids: Array.from(ids).slice(0, 10)
        };
      });
      
      return `Tags: ${selectors.tags.join(', ')}. Classes: ${selectors.classes.join(', ')}. IDs: ${selectors.ids.join(', ')}`;
    } catch (error) {
      return 'Unable to get available selectors';
    }
  }

  async closeBrowser({ sessionId }) {
    try {
      await this.sessionManager.cleanupSession(sessionId);
      return {
        content: [{ type: 'text', text: `Browser session ${sessionId} closed` }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Session ${sessionId} cleanup completed (may have been already closed)` }]
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Playwright MCP Server running...');
  }
}

class RemoteMCPWrapper {
  constructor(mcpServer) {
    this.mcpServer = mcpServer;
    this.app = express();
    this.setupHTTPServer();
  }

  setupHTTPServer() {
    this.app.use(cors());
    
    // Enhanced request logging middleware
    this.app.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      const userAgent = req.get('User-Agent') || 'Unknown';
      const authHeader = req.get('Authorization') ? 'Present' : 'Missing';
      
      console.log(`\n🌐 [${timestamp}] INCOMING REQUEST:`);
      console.log(`   Method: ${req.method}`);
      console.log(`   Path: ${req.path}`);
      console.log(`   Query: ${JSON.stringify(req.query)}`);
      console.log(`   Headers: ${JSON.stringify(req.headers, null, 2)}`);
      console.log(`   User-Agent: ${userAgent}`);
      console.log(`   Auth: ${authHeader}`);
      console.log(`   Content-Type: ${req.get('Content-Type') || 'None'}`);
      
      next();
    });
    
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req, res, buf, encoding) => {
        console.log(`📦 Raw body received (${buf.length} bytes)`);
        if (buf.length > 0 && buf.length < 1000) {
          console.log(`📦 Body preview: ${buf.toString('utf8')}`);
        }
      }
    }));
    
    // Log parsed body
    this.app.use((req, res, next) => {
      if (req.body && Object.keys(req.body).length > 0) {
        console.log(`📋 Parsed JSON body:`, JSON.stringify(req.body, null, 2));
      }
      next();
    });

    this.app.get('/health', (req, res) => {
      console.log(`✅ Health check requested`);
      const sessionStats = this.mcpServer.sessionManager.getSessionStats();
      res.json({ 
        status: 'healthy', 
        service: 'mcp-playwright-server',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        sessions: sessionStats
      });
    });

    this.app.get('/sessions', (req, res) => {
      console.log(`📊 Session stats requested`);
      const sessionStats = this.mcpServer.sessionManager.getSessionStats();
      res.json(sessionStats);
    });

    // MCP JSON-RPC 2.0 handler function
    const handleMCP = async (req, res) => {
      try {
        console.log(`\n🔧 MCP HANDLER CALLED:`);
        console.log(`   Request path: ${req.path}`);
        console.log(`   Request method: ${req.method}`);
        console.log(`   Full MCP Request:`, JSON.stringify(req.body, null, 2));
        
        const { jsonrpc, id, method, params } = req.body;
        console.log(`   Extracted - JSONRPC: ${jsonrpc}, ID: ${id}, Method: ${method}`);
        
        if (method === 'initialize') {
          console.log(`🚀 Handling INITIALIZE request`);
          const response = {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2025-03-26',
              capabilities: {
                tools: {
                  listChanged: true
                }
              },
              serverInfo: {
                name: 'playwright-mcp-server',
                version: '1.0.0'
              }
            }
          };
          console.log(`✅ INITIALIZE Response:`, JSON.stringify(response, null, 2));
          return res.json(response);
        }

        if (method === 'notifications/initialized') {
          console.log(`📢 Handling NOTIFICATIONS/INITIALIZED request`);
          // This is a notification, no response needed according to JSON-RPC 2.0 spec
          console.log(`✅ INITIALIZED notification acknowledged`);
          return res.status(204).send(); // No content response
        }

        // Handle any other notification methods
        if (method && method.startsWith('notifications/')) {
          console.log(`📢 Handling notification: ${method}`);
          console.log(`✅ Notification acknowledged`);
          return res.status(204).send(); // No content response for notifications
        }
        
        if (method === 'tools/list') {
          console.log(`📋 Handling TOOLS/LIST request`);
          const response = {
            jsonrpc: '2.0',
            id,
            result: {
              tools: [
                {
                  name: 'launch_browser',
                  description: 'Launch a new browser instance',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      browserType: {
                        type: 'string',
                        enum: ['chromium', 'firefox', 'webkit'],
                        description: 'Type of browser to launch'
                      },
                      headless: {
                        type: 'boolean',
                        description: 'Run browser in headless mode',
                        default: true
                      },
                      sessionId: {
                        type: 'string',
                        description: 'Unique session identifier'
                      }
                    },
                    required: ['browserType', 'sessionId']
                  }
                },
                {
                  name: 'navigate',
                  description: 'Navigate to a URL',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      sessionId: { type: 'string', description: 'Session identifier' },
                      url: { type: 'string', description: 'URL to navigate to' }
                    },
                    required: ['sessionId', 'url']
                  }
                },
                {
                  name: 'screenshot',
                  description: 'Take a screenshot of the current page',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      sessionId: { type: 'string', description: 'Session identifier' },
                      fullPage: { type: 'boolean', description: 'Capture full page', default: false }
                    },
                    required: ['sessionId']
                  }
                },
                {
                  name: 'click',
                  description: 'Click an element on the page',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      sessionId: { type: 'string', description: 'Session identifier' },
                      selector: { type: 'string', description: 'CSS selector for the element' }
                    },
                    required: ['sessionId', 'selector']
                  }
                },
                {
                  name: 'fill',
                  description: 'Fill an input field',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      sessionId: { type: 'string', description: 'Session identifier' },
                      selector: { type: 'string', description: 'CSS selector for the input' },
                      value: { type: 'string', description: 'Value to fill' }
                    },
                    required: ['sessionId', 'selector', 'value']
                  }
                },
                {
                  name: 'get_text',
                  description: 'Get text content from an element',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      sessionId: { type: 'string', description: 'Session identifier' },
                      selector: { type: 'string', description: 'CSS selector for the element' }
                    },
                    required: ['sessionId', 'selector']
                  }
                },
                {
                  name: 'evaluate',
                  description: 'Execute JavaScript in the page context',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      sessionId: { type: 'string', description: 'Session identifier' },
                      script: { type: 'string', description: 'JavaScript code to execute' }
                    },
                    required: ['sessionId', 'script']
                  }
                },
                {
                  name: 'get_html',
                  description: 'Extract the HTML content of the current page',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      sessionId: { type: 'string', description: 'Session identifier' },
                      selector: { type: 'string', description: 'CSS selector to extract specific element (optional, defaults to entire page)' }
                    },
                    required: ['sessionId']
                  }
                },
                {
                  name: 'get_markdown',
                  description: 'Extract the HTML content and convert it to markdown',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      sessionId: { type: 'string', description: 'Session identifier' },
                      selector: { type: 'string', description: 'CSS selector to extract specific element (optional, defaults to entire page)' }
                    },
                    required: ['sessionId']
                  }
                },
                {
                  name: 'close_browser',
                  description: 'Close a browser session',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      sessionId: { type: 'string', description: 'Session identifier' }
                    },
                    required: ['sessionId']
                  }
                }
              ]
            }
          };
          console.log(`✅ TOOLS/LIST Response: ${response.result.tools.length} tools returned`);
          return res.json(response);
        }
        
        if (method === 'tools/call') {
          console.log(`🛠️ Handling TOOLS/CALL request`);
          const { name, arguments: args } = params;
          console.log(`   Tool: ${name}, Args:`, JSON.stringify(args, null, 2));
          
          const result = await this.executeToolCommand(name, args);
          console.log(`✅ TOOLS/CALL Result:`, JSON.stringify(result, null, 2));
          
          const response = {
            jsonrpc: '2.0',
            id,
            result
          };
          return res.json(response);
        }
        
        // Unknown method
        console.log(`❌ Unknown MCP method: ${method}`);
        const errorResponse = {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        };
        console.log(`❌ Error Response:`, JSON.stringify(errorResponse, null, 2));
        res.status(400).json(errorResponse);
        
      } catch (error) {
        console.log(`💥 MCP Handler Error:`, error);
        console.log(`💥 Error Stack:`, error.stack);
        
        const errorResponse = {
          jsonrpc: '2.0',
          id: req.body?.id || null,
          error: {
            code: -32603,
            message: `Internal error: ${error.message}`
          }
        };
        console.log(`❌ Internal Error Response:`, JSON.stringify(errorResponse, null, 2));
        res.status(500).json(errorResponse);
      }
    };

    // Register MCP handler for all possible endpoints OpenAI might call
    this.app.post('/', handleMCP);           // Root endpoint
    this.app.post('/mcp', handleMCP);        // /mcp endpoint  
    this.app.get('/mcp', (req, res) => {     // GET /mcp endpoint
      console.log(`🔍 GET /mcp endpoint called`);
      const response = {
        name: 'playwright-mcp-server',
        version: '1.0.0',
        description: 'Playwright browser automation MCP server',
        capabilities: {
          tools: {
            listChanged: true
          }
        }
      };
      console.log(`✅ GET /mcp Response:`, JSON.stringify(response, null, 2));
      res.json(response);
    });
    this.app.post('/tools', handleMCP);      // /tools endpoint
    this.app.post('/tools/list', handleMCP); // Direct tools/list
    this.app.post('/tools/call', handleMCP); // Direct tools/call
    
    // Add GET handlers too in case OpenAI uses GET
    this.app.get('/tools/list', (req, res) => {
      console.log(`🔍 GET /tools/list endpoint called`);
      const response = {
        tools: [
          { name: 'launch_browser', description: 'Launch a new browser instance' },
          { name: 'navigate', description: 'Navigate to a URL' },
          { name: 'screenshot', description: 'Take a screenshot of the current page' },
          { name: 'click', description: 'Click an element on the page' },
          { name: 'fill', description: 'Fill an input field' },
          { name: 'get_text', description: 'Get text content from an element' },
          { name: 'evaluate', description: 'Execute JavaScript in the page context' },
          { name: 'get_html', description: 'Extract HTML content of the current page' },
          { name: 'get_markdown', description: 'Extract HTML content and convert it to markdown' },
          { name: 'close_browser', description: 'Close a browser session' }
        ]
      };
      console.log(`✅ GET /tools/list Response: ${response.tools.length} tools`);
      res.json(response);
    });

    // Catch-all handler for any other MCP-related requests
    this.app.all('*', (req, res, next) => {
      if (!res.headersSent) {
        console.log(`\n🔍 CATCH-ALL HANDLER:`);
        console.log(`   Method: ${req.method}`);
        console.log(`   Path: ${req.path}`);
        console.log(`   Query:`, req.query);
        console.log(`   Body:`, req.body);
        console.log(`   Headers:`, req.headers);
        
        // If it looks like an MCP request, handle it
        if (req.body && req.body.jsonrpc && req.body.method) {
          console.log(`🔄 Redirecting to MCP handler`);
          return handleMCP(req, res);
        }
        
        // If it's asking for tools in any way, return tools
        if (req.path.includes('tool') || req.method === 'GET') {
          console.log(`🛠️ Returning generic tools list`);
          return res.json({
            tools: [
              { name: 'launch_browser', description: 'Launch a new browser instance' },
              { name: 'navigate', description: 'Navigate to a URL' },
              { name: 'screenshot', description: 'Take a screenshot of the current page' },
              { name: 'click', description: 'Click an element on the page' },
              { name: 'fill', description: 'Fill an input field' },
              { name: 'get_text', description: 'Get text content from an element' },
              { name: 'evaluate', description: 'Execute JavaScript in the page context' },
              { name: 'get_html', description: 'Extract HTML content of the current page' },
              { name: 'get_markdown', description: 'Extract HTML content and convert it to markdown' },
              { name: 'close_browser', description: 'Close a browser session' }
            ]
          });
        }
        
        console.log(`❌ No handler found, passing to next middleware`);
      }
      next();
    });

    // Legacy HTTP endpoints for direct testing
    this.app.post('/tool/:toolName', async (req, res) => {
      try {
        const { toolName } = req.params;
        const args = req.body;
        console.log(`🔧 Legacy tool endpoint: ${toolName}`, JSON.stringify(args, null, 2));
        
        const result = await this.executeToolCommand(toolName, args);
        console.log(`✅ Legacy tool result:`, JSON.stringify(result, null, 2));
        res.json(result);
      } catch (error) {
        console.log(`❌ Legacy tool error:`, error.message);
        res.status(500).json({ error: error.message });
      }
    });

    const httpServer = this.app.listen(process.env.HTTP_PORT || 3000, () => {
      console.log(`HTTP server listening on port ${process.env.HTTP_PORT || 3000}`);
    });

    // WebSocket support
    const wss = new WebSocketServer({ server: httpServer });
    
    wss.on('connection', (ws) => {
      console.log('WebSocket client connected');
      
      ws.on('message', async (message) => {
        try {
          const { command, tool, args } = JSON.parse(message);
          
          if (command === 'execute') {
            const result = await this.executeToolCommand(tool, args);
            ws.send(JSON.stringify({ status: 'success', result }));
          }
        } catch (error) {
          ws.send(JSON.stringify({ status: 'error', error: error.message }));
        }
      });
      
      ws.on('close', () => {
        console.log('WebSocket client disconnected');
      });
    });
  }

  async executeToolCommand(toolName, args) {
    const toolMap = {
      'launch_browser': 'launchBrowser',
      'navigate': 'navigate',
      'screenshot': 'screenshot',
      'click': 'click',
      'fill': 'fill',
      'get_text': 'getText',
      'evaluate': 'evaluate',
      'get_html': 'getHTML',
      'get_markdown': 'getMarkdown',
      'close_browser': 'closeBrowser'
    };

    const methodName = toolMap[toolName];
    if (!methodName || !this.mcpServer[methodName]) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    return await this.mcpServer[methodName](args);
  }
}

async function main() {
  const mode = process.env.MODE || 'mcp';
  
  const mcpServer = new PlaywrightMCPServer();
  
  if (mode === 'remote') {
    new RemoteMCPWrapper(mcpServer);
  } else {
    await mcpServer.run();
  }
}

main().catch(console.error);