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

dotenv.config();

class PlaywrightMCPServer {
  constructor() {
    this.browsers = new Map();
    this.contexts = new Map();
    this.pages = new Map();
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

  async launchBrowser({ browserType, headless = true, sessionId }) {
    try {
      const browserClass = browserType === 'firefox' ? firefox : 
                          browserType === 'webkit' ? webkit : chromium;
      
      const browser = await browserClass.launch({ 
        headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const context = await browser.newContext();
      const page = await context.newPage();
      
      this.browsers.set(sessionId, browser);
      this.contexts.set(sessionId, context);
      this.pages.set(sessionId, page);
      
      return {
        content: [{ type: 'text', text: `Browser launched successfully with session ID: ${sessionId}` }]
      };
    } catch (error) {
      throw new Error(`Failed to launch browser: ${error.message}`);
    }
  }

  async navigate({ sessionId, url }) {
    const page = this.pages.get(sessionId);
    if (!page) throw new Error('Session not found');
    
    await page.goto(url, { waitUntil: 'networkidle' });
    return {
      content: [{ type: 'text', text: `Navigated to ${url}` }]
    };
  }

  async screenshot({ sessionId, fullPage = false }) {
    const page = this.pages.get(sessionId);
    if (!page) throw new Error('Session not found');
    
    const screenshot = await page.screenshot({ 
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
  }

  async click({ sessionId, selector }) {
    const page = this.pages.get(sessionId);
    if (!page) throw new Error('Session not found');
    
    await page.click(selector);
    return {
      content: [{ type: 'text', text: `Clicked element: ${selector}` }]
    };
  }

  async fill({ sessionId, selector, value }) {
    const page = this.pages.get(sessionId);
    if (!page) throw new Error('Session not found');
    
    await page.fill(selector, value);
    return {
      content: [{ type: 'text', text: `Filled ${selector} with value` }]
    };
  }

  async getText({ sessionId, selector }) {
    const page = this.pages.get(sessionId);
    if (!page) throw new Error('Session not found');
    
    const text = await page.textContent(selector);
    return {
      content: [{ type: 'text', text: text || 'No text found' }]
    };
  }

  async evaluate({ sessionId, script }) {
    const page = this.pages.get(sessionId);
    if (!page) throw new Error('Session not found');
    
    const result = await page.evaluate(script);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }

  async closeBrowser({ sessionId }) {
    const browser = this.browsers.get(sessionId);
    if (browser) {
      await browser.close();
      this.browsers.delete(sessionId);
      this.contexts.delete(sessionId);
      this.pages.delete(sessionId);
    }
    
    return {
      content: [{ type: 'text', text: `Browser session ${sessionId} closed` }]
    };
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
      res.json({ 
        status: 'healthy', 
        service: 'mcp-playwright-server',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
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