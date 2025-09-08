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
    this.app.use(express.json());
    
    // Log all requests to debug what OpenAI is calling
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Headers:`, JSON.stringify(req.headers, null, 2));
      next();
    });

    this.app.get('/health', (_, res) => {
      res.json({ status: 'healthy', service: 'mcp-playwright-server' });
    });

    // MCP server manifest for OpenAI platform
    this.app.get('/.well-known/mcp-server', (_, res) => {
      res.json({
        name: 'playwright-mcp-server',
        version: '1.0.0',
        description: 'Playwright browser automation MCP server',
        author: 'Your Name',
        license: 'MIT',
        homepage: 'https://mcp.rayo.work',
        repository: 'https://github.com/your-username/mcp-playwright',
        capabilities: {
          tools: true,
          resources: false,
          prompts: false
        },
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
        ],
        endpoints: {
          tools: '/tools',
          health: '/health'
        }
      });
    });

    // Add multiple endpoint variations that OpenAI might call
    const toolsListHandler = (_, res) => {
      res.json({
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
      });
    };

    // Register the handler for multiple possible endpoints OpenAI might call
    this.app.post('/tools/list', toolsListHandler);
    this.app.get('/tools/list', toolsListHandler);
    this.app.post('/tools', toolsListHandler);
    this.app.get('/tools', toolsListHandler);
    this.app.post('/mcp/tools/list', toolsListHandler);
    this.app.get('/mcp/tools/list', toolsListHandler);

    // MCP protocol tools/call endpoint (what OpenAI calls for tool execution)
    const toolsCallHandler = async (req, res) => {
      try {
        const { name, arguments: args } = req.body;
        
        const result = await this.executeToolCommand(name, args);
        res.json(result);
      } catch (error) {
        res.status(500).json({
          error: {
            message: error.message,
            type: 'tool_execution_error'
          }
        });
      }
    };

    // Register call handler for multiple endpoints
    this.app.post('/tools/call', toolsCallHandler);
    this.app.post('/mcp/tools/call', toolsCallHandler);

    // Add a catch-all route for debugging what OpenAI is calling
    this.app.all('*', (req, res, next) => {
      if (!res.headersSent) {
        console.log(`Unhandled route: ${req.method} ${req.path}`);
        console.log('Query params:', req.query);
        console.log('Body:', req.body);
        
        // If it's a tools-related request, try to handle it
        if (req.path.includes('tools') || req.path.includes('mcp')) {
          if (req.path.includes('list') || req.method === 'GET') {
            return toolsListHandler(req, res);
          }
          if (req.path.includes('call') || req.method === 'POST') {
            return toolsCallHandler(req, res);
          }
        }
      }
      next();
    });

    this.app.post('/tool/:toolName', async (req, res) => {
      try {
        const { toolName } = req.params;
        const args = req.body;
        
        const result = await this.executeToolCommand(toolName, args);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    const httpServer = this.app.listen(process.env.HTTP_PORT || 3000, () => {
      console.log(`HTTP server listening on port ${process.env.HTTP_PORT || 3000}`);
    });

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