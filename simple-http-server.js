#!/usr/bin/env node

import express from 'express';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || 'playwright-mcp-secret-2024';

const app = express();

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

// MCP Server management
let mcpProcess = null;

// Start MCP Server
function startMCPServer() {
  if (mcpProcess) {
    console.log('MCP Server already running');
    return;
  }

  console.log('🚀 Starting Microsoft Playwright MCP Server...');
  mcpProcess = spawn('npx', ['@playwright/mcp@latest'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: __dirname,
    env: { ...process.env }
  });

  mcpProcess.stdout.on('data', (data) => {
    console.log(`MCP Server: ${data}`);
  });

  mcpProcess.stderr.on('data', (data) => {
    console.error(`MCP Server Error: ${data}`);
  });

  mcpProcess.on('close', (code) => {
    console.log(`MCP Server exited with code ${code}`);
    mcpProcess = null;
  });

  mcpProcess.on('error', (err) => {
    console.error('Failed to start MCP Server:', err);
    mcpProcess = null;
  });
}

// HTTP API endpoints
app.get('/', (req, res) => {
  res.json({
    name: 'Playwright MCP Server',
    version: '1.0.0',
    description: 'Microsoft Playwright MCP Server for OpenAI platform',
    endpoints: {
      tools: '/tools',
      status: '/api/status',
      health: '/api/health'
    },
    authentication: `Bearer ${ACCESS_TOKEN}`,
    mcpTools: [
      'navigate - Navigate to URLs',
      'screenshot - Take screenshots',
      'click - Click elements',
      'type - Type text',
      'getText - Extract text',
      'fill - Fill forms',
      'select - Select options',
      'wait - Wait for elements',
      'evaluate - Run JavaScript',
      'download - Download files'
    ]
  });
});

// MCP Protocol: List tools endpoint
app.get('/tools', authenticateToken, (req, res) => {
  res.json({
    tools: [
      {
        name: 'navigate',
        description: 'Navigate to a URL',
        inputSchema: {
          type: 'object',
          properties: {
            url: { 
              type: 'string', 
              description: 'URL to navigate to' 
            }
          },
          required: ['url']
        }
      },
      {
        name: 'screenshot',
        description: 'Take a screenshot of the current page',
        inputSchema: {
          type: 'object',
          properties: {
            fullPage: { 
              type: 'boolean', 
              description: 'Take full page screenshot',
              default: false
            }
          }
        }
      },
      {
        name: 'click',
        description: 'Click an element',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { 
              type: 'string', 
              description: 'CSS selector of element to click' 
            }
          },
          required: ['selector']
        }
      },
      {
        name: 'type',
        description: 'Type text into an element',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { 
              type: 'string', 
              description: 'CSS selector of input element' 
            },
            text: { 
              type: 'string', 
              description: 'Text to type' 
            }
          },
          required: ['selector', 'text']
        }
      },
      {
        name: 'getText',
        description: 'Get text content from an element',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { 
              type: 'string', 
              description: 'CSS selector of element' 
            }
          },
          required: ['selector']
        }
      },
      {
        name: 'fill',
        description: 'Fill a form field',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { 
              type: 'string', 
              description: 'CSS selector of form field' 
            },
            value: { 
              type: 'string', 
              description: 'Value to fill' 
            }
          },
          required: ['selector', 'value']
        }
      },
      {
        name: 'select',
        description: 'Select an option from dropdown',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { 
              type: 'string', 
              description: 'CSS selector of select element' 
            },
            value: { 
              type: 'string', 
              description: 'Value to select' 
            }
          },
          required: ['selector', 'value']
        }
      },
      {
        name: 'wait',
        description: 'Wait for an element to appear',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { 
              type: 'string', 
              description: 'CSS selector to wait for' 
            },
            timeout: { 
              type: 'number', 
              description: 'Timeout in milliseconds',
              default: 30000
            }
          },
          required: ['selector']
        }
      },
      {
        name: 'evaluate',
        description: 'Run JavaScript in the browser',
        inputSchema: {
          type: 'object',
          properties: {
            script: { 
              type: 'string', 
              description: 'JavaScript code to execute' 
            }
          },
          required: ['script']
        }
      },
      {
        name: 'download',
        description: 'Download a file',
        inputSchema: {
          type: 'object',
          properties: {
            url: { 
              type: 'string', 
              description: 'URL of file to download' 
            }
          },
          required: ['url']
        }
      }
    ]
  });
});

app.get('/api/status', authenticateToken, (req, res) => {
  res.json({
    mcpServer: {
      running: mcpProcess !== null,
      pid: mcpProcess ? mcpProcess.pid : null
    },
    uptime: process.uptime(),
    platform: 'OpenAI Compatible'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mcpRunning: mcpProcess !== null,
    platform: 'OpenAI Compatible'
  });
});

// MCP Protocol: Execute tool endpoint
app.post('/tools/:toolName', authenticateToken, async (req, res) => {
  const { toolName } = req.params;
  const { arguments: toolArgs } = req.body;

  try {
    if (!mcpProcess || !mcpProcess.stdin.writable) {
      return res.status(503).json({
        error: 'MCP Server not available',
        message: 'The underlying MCP server is not running'
      });
    }

    // Create MCP request
    const mcpRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: toolArgs || {}
      }
    };

    // Send to MCP server
    mcpProcess.stdin.write(JSON.stringify(mcpRequest) + '\n');

    // For now, return a success response
    res.json({
      toolName,
      status: 'executed',
      message: `Tool ${toolName} has been sent to MCP server`,
      arguments: toolArgs
    });

  } catch (error) {
    res.status(500).json({
      error: 'Tool execution failed',
      message: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Playwright MCP Server running on port ${PORT}`);
  console.log(`🔗 HTTP API: http://localhost:${PORT}`);
  console.log(`🔑 Access Token: ${ACCESS_TOKEN}`);
  console.log(`🎭 Auto-starting MCP Server...`);
  
  // Auto-start MCP server
  startMCPServer();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  if (mcpProcess) {
    mcpProcess.kill();
  }
  process.exit(0);
});

export { app, startMCPServer };
