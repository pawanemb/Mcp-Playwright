#!/usr/bin/env node

import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || 'playwright-mcp-secret-2024';

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

// MCP Server management
let mcpProcess = null;
const activeConnections = new Set();

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
    // Broadcast to all connected clients
    activeConnections.forEach(ws => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'mcp_output',
          data: data.toString()
        }));
      }
    });
  });

  mcpProcess.stderr.on('data', (data) => {
    console.error(`MCP Server Error: ${data}`);
    activeConnections.forEach(ws => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'mcp_error',
          data: data.toString()
        }));
      }
    });
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

// WebSocket connection handling for OpenAI platform
wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection from OpenAI platform');
  
  // Check authentication
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token') || req.headers.authorization?.split(' ')[1];
  
  if (token !== ACCESS_TOKEN) {
    ws.close(1008, 'Invalid access token');
    return;
  }

  activeConnections.add(ws);
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'mcp_request':
          if (mcpProcess && mcpProcess.stdin.writable) {
            // Send MCP request to the actual MCP server
            mcpProcess.stdin.write(JSON.stringify(data.payload) + '\n');
          } else {
            ws.send(JSON.stringify({
              type: 'mcp_response',
              error: 'MCP Server not available'
            }));
          }
          break;
          
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
          
        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Unknown message type'
          }));
      }
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    activeConnections.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    activeConnections.delete(ws);
  });

  // Send welcome message with available tools
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to Playwright MCP Server',
    serverStatus: mcpProcess ? 'running' : 'stopped',
    availableTools: [
      'navigate',
      'screenshot', 
      'click',
      'type',
      'getText',
      'fill',
      'select',
      'wait',
      'evaluate',
      'download'
    ]
  }));
});

// MCP Protocol endpoints for OpenAI platform
app.get('/', (req, res) => {
  res.json({
    name: 'Playwright MCP Server for OpenAI Platform',
    version: '1.0.0',
    description: 'Microsoft Playwright MCP Server accessible from OpenAI platform',
    endpoints: {
      websocket: `/ws?token=${ACCESS_TOKEN}`,
      status: '/api/status',
      start: '/api/start',
      stop: '/api/stop',
      health: '/api/health',
      tools: '/api/tools'
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
    connections: activeConnections.size,
    uptime: process.uptime(),
    platform: 'OpenAI Compatible'
  });
});

app.get('/api/tools', authenticateToken, (req, res) => {
  res.json({
    tools: [
      {
        name: 'navigate',
        description: 'Navigate to a URL',
        parameters: {
          url: { type: 'string', description: 'URL to navigate to' }
        }
      },
      {
        name: 'screenshot',
        description: 'Take a screenshot of the current page',
        parameters: {
          fullPage: { type: 'boolean', description: 'Take full page screenshot' }
        }
      },
      {
        name: 'click',
        description: 'Click an element',
        parameters: {
          selector: { type: 'string', description: 'CSS selector of element to click' }
        }
      },
      {
        name: 'type',
        description: 'Type text into an element',
        parameters: {
          selector: { type: 'string', description: 'CSS selector of input element' },
          text: { type: 'string', description: 'Text to type' }
        }
      },
      {
        name: 'getText',
        description: 'Get text content from an element',
        parameters: {
          selector: { type: 'string', description: 'CSS selector of element' }
        }
      },
      {
        name: 'fill',
        description: 'Fill a form field',
        parameters: {
          selector: { type: 'string', description: 'CSS selector of form field' },
          value: { type: 'string', description: 'Value to fill' }
        }
      },
      {
        name: 'select',
        description: 'Select an option from dropdown',
        parameters: {
          selector: { type: 'string', description: 'CSS selector of select element' },
          value: { type: 'string', description: 'Value to select' }
        }
      },
      {
        name: 'wait',
        description: 'Wait for an element to appear',
        parameters: {
          selector: { type: 'string', description: 'CSS selector to wait for' },
          timeout: { type: 'number', description: 'Timeout in milliseconds' }
        }
      },
      {
        name: 'evaluate',
        description: 'Run JavaScript in the browser',
        parameters: {
          script: { type: 'string', description: 'JavaScript code to execute' }
        }
      },
      {
        name: 'download',
        description: 'Download a file',
        parameters: {
          url: { type: 'string', description: 'URL of file to download' }
        }
      }
    ]
  });
});

app.post('/api/start', authenticateToken, (req, res) => {
  startMCPServer();
  res.json({ 
    status: 'MCP Server started',
    running: mcpProcess !== null
  });
});

app.post('/api/stop', authenticateToken, (req, res) => {
  if (mcpProcess) {
    mcpProcess.kill();
    mcpProcess = null;
  }
  res.json({ 
    status: 'MCP Server stopped',
    running: false
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
    // In a real implementation, you'd wait for the MCP response
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
server.listen(PORT, () => {
  console.log(`🚀 Playwright MCP Server for OpenAI Platform running on port ${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}/ws?token=${ACCESS_TOKEN}`);
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
  
  activeConnections.forEach(ws => {
    ws.close();
  });
  
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export { app, wss, startMCPServer };
