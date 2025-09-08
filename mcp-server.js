#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || 'your-secret-token-here';

// Initialize MCP Server
const server = new Server(
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

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'navigate',
        description: 'Navigate to a URL in a browser',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to navigate to',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'screenshot',
        description: 'Take a screenshot of the current page',
        inputSchema: {
          type: 'object',
          properties: {
            fullPage: {
              type: 'boolean',
              description: 'Whether to capture the full page',
              default: false,
            },
          },
        },
      },
      {
        name: 'click',
        description: 'Click an element on the page',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the element to click',
            },
          },
          required: ['selector'],
        },
      },
      {
        name: 'type',
        description: 'Type text into an input field',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the input field',
            },
            text: {
              type: 'string',
              description: 'Text to type',
            },
          },
          required: ['selector', 'text'],
        },
      },
      {
        name: 'getText',
        description: 'Get text content from an element',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the element',
            },
          },
          required: ['selector'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case 'navigate': {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();
        
        await page.goto(args.url);
        const title = await page.title();
        
        await browser.close();
        
        return {
          content: [
            {
              type: 'text',
              text: `Successfully navigated to ${args.url}. Page title: ${title}`,
            },
          ],
        };
      }
      
      case 'screenshot': {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();
        
        const screenshot = await page.screenshot({ 
          fullPage: args.fullPage || false,
          type: 'png'
        });
        
        await browser.close();
        
        return {
          content: [
            {
              type: 'text',
              text: `Screenshot taken successfully. Size: ${screenshot.length} bytes`,
            },
          ],
        };
      }
      
      case 'click': {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();
        
        await page.click(args.selector);
        
        await browser.close();
        
        return {
          content: [
            {
              type: 'text',
              text: `Successfully clicked element: ${args.selector}`,
            },
          ],
        };
      }
      
      case 'type': {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();
        
        await page.fill(args.selector, args.text);
        
        await browser.close();
        
        return {
          content: [
            {
              type: 'text',
              text: `Successfully typed "${args.text}" into ${args.selector}`,
            },
          ],
        };
      }
      
      case 'getText': {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();
        
        const text = await page.textContent(args.selector);
        
        await browser.close();
        
        return {
          content: [
            {
              type: 'text',
              text: `Text content: ${text}`,
            },
          ],
        };
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Playwright MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
