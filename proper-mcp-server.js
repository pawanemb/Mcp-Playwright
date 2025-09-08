#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/server";
import { chromium } from "playwright";
import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Global browser/page handles
let browser, page;

const PORT = process.env.PORT || 3000;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || 'playwright-mcp-secret-2024';

// Create Express app for HTTP endpoints
const app = express();
const server = createServer(app);

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  if (token !== ACCESS_TOKEN) {
    return res.status(403).json({ error: 'Invalid access token' });
  }

  next();
};

// Create MCP Server
const mcpServer = new Server({
  name: "playwright-mcp",
  version: "0.0.1",
});

// Register tools
mcpServer.setTools([
  {
    name: "launch_browser",
    description: "Launch a Chromium browser instance",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      browser = await chromium.launch();
      const context = await browser.newContext();
      page = await context.newPage();
      return { status: "browser launched" };
    },
  },
  {
    name: "goto_url",
    description: "Navigate to a webpage",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
    handler: async ({ url }) => {
      await page.goto(url);
      return { status: `navigated to ${url}` };
    },
  },
  {
    name: "screenshot_page",
    description: "Take a screenshot of the current page",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    handler: async ({ path }) => {
      await page.screenshot({ path });
      return { saved: path };
    },
  },
  {
    name: "extract_text",
    description: "Extract full page text",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const content = await page.textContent("body");
      return { text: content };
    },
  },
  {
    name: "click_selector",
    description: "Click an element by CSS selector",
    inputSchema: {
      type: "object",
      properties: { selector: { type: "string" } },
      required: ["selector"],
    },
    handler: async ({ selector }) => {
      await page.click(selector);
      return { clicked: selector };
    },
  },
  {
    name: "fill_input",
    description: "Type text into an input field",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        text: { type: "string" },
      },
      required: ["selector", "text"],
    },
    handler: async ({ selector, text }) => {
      await page.fill(selector, text);
      return { filled: { selector, text } };
    },
  },
  {
    name: "evaluate_script",
    description: "Run custom JS in the page",
    inputSchema: {
      type: "object",
      properties: { script: { type: "string" } },
      required: ["script"],
    },
    handler: async ({ script }) => {
      const result = await page.evaluate(script);
      return { result };
    },
  },
  {
    name: "pdf_page",
    description: "Save current page as PDF",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    handler: async ({ path }) => {
      await page.pdf({ path });
      return { saved: path };
    },
  },
  {
    name: "close_browser",
    description: "Close the browser",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      await browser.close();
      return { status: "browser closed" };
    },
  },
]);

// HTTP API endpoints
app.get('/', (req, res) => {
  res.json({
    name: 'Playwright MCP Server',
    version: '1.0.0',
    description: 'Microsoft Playwright MCP Server with proper MCP protocol',
    endpoints: {
      tools: '/tools',
      status: '/api/status',
      health: '/api/health'
    },
    authentication: `Bearer ${ACCESS_TOKEN}`,
    mcpTools: [
      'launch_browser - Launch a Chromium browser instance',
      'goto_url - Navigate to a webpage',
      'screenshot_page - Take a screenshot of the current page',
      'extract_text - Extract full page text',
      'click_selector - Click an element by CSS selector',
      'fill_input - Type text into an input field',
      'evaluate_script - Run custom JS in the page',
      'pdf_page - Save current page as PDF',
      'close_browser - Close the browser'
    ]
  });
});

// MCP Protocol: List tools endpoint
app.get('/tools', authenticateToken, (req, res) => {
  res.json({
    tools: [
      {
        name: 'launch_browser',
        description: 'Launch a Chromium browser instance',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'goto_url',
        description: 'Navigate to a webpage',
        inputSchema: {
          type: 'object',
          properties: { url: { type: 'string' } },
          required: ['url']
        }
      },
      {
        name: 'screenshot_page',
        description: 'Take a screenshot of the current page',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path']
        }
      },
      {
        name: 'extract_text',
        description: 'Extract full page text',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'click_selector',
        description: 'Click an element by CSS selector',
        inputSchema: {
          type: 'object',
          properties: { selector: { type: 'string' } },
          required: ['selector']
        }
      },
      {
        name: 'fill_input',
        description: 'Type text into an input field',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string' },
            text: { type: 'string' }
          },
          required: ['selector', 'text']
        }
      },
      {
        name: 'evaluate_script',
        description: 'Run custom JS in the page',
        inputSchema: {
          type: 'object',
          properties: { script: { type: 'string' } },
          required: ['script']
        }
      },
      {
        name: 'pdf_page',
        description: 'Save current page as PDF',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path']
        }
      },
      {
        name: 'close_browser',
        description: 'Close the browser',
        inputSchema: { type: 'object', properties: {} }
      }
    ]
  });
});

app.get('/api/status', authenticateToken, (req, res) => {
  res.json({
    mcpServer: {
      running: true,
      name: 'playwright-mcp',
      version: '0.0.1'
    },
    browser: {
      launched: browser !== null,
      page: page !== null
    },
    uptime: process.uptime(),
    platform: 'OpenAI Compatible'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mcpRunning: true,
    platform: 'OpenAI Compatible'
  });
});

// MCP Protocol: Execute tool endpoint
app.post('/tools/:toolName', authenticateToken, async (req, res) => {
  const { toolName } = req.params;
  const { arguments: toolArgs } = req.body;

  try {
    // Get the tool handler from the MCP server
    const tools = mcpServer.getTools();
    const tool = tools.find(t => t.name === toolName);
    
    if (!tool) {
      return res.status(404).json({
        error: 'Tool not found',
        message: `Tool '${toolName}' does not exist`
      });
    }

    // Execute the tool
    const result = await tool.handler(toolArgs || {});
    
    res.json({
      toolName,
      status: 'success',
      result
    });

  } catch (error) {
    res.status(500).json({
      error: 'Tool execution failed',
      message: error.message
    });
  }
});

// Start HTTP server
server.listen(PORT, () => {
  console.log(`🚀 Playwright MCP Server running on port ${PORT}`);
  console.log(`🔗 HTTP API: http://localhost:${PORT}`);
  console.log(`🔑 Access Token: ${ACCESS_TOKEN}`);
  console.log(`🎭 MCP Server initialized with ${mcpServer.getTools().length} tools`);
});

// Start MCP server (stdio mode)
mcpServer.start();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  if (browser) {
    browser.close();
  }
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export { app, mcpServer };
