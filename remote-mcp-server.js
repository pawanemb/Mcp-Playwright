#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const PORT = process.env.PORT || 3000;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || 'your-secret-token-here';
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';

// Initialize Express app
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());

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
const activeConnections = new Set();

// Start MCP Server
function startMCPServer() {
  if (mcpProcess) {
    console.log('MCP Server already running');
    return;
  }

  console.log('Starting Microsoft Playwright MCP Server...');
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

// Stop MCP Server
function stopMCPServer() {
  if (mcpProcess) {
    mcpProcess.kill();
    mcpProcess = null;
    console.log('MCP Server stopped');
  }
}

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');
  
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
        case 'mcp_command':
          if (mcpProcess && mcpProcess.stdin.writable) {
            mcpProcess.stdin.write(JSON.stringify(data.command) + '\n');
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

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to Remote Playwright MCP Server',
    serverStatus: mcpProcess ? 'running' : 'stopped'
  }));
});

// REST API endpoints
app.get('/', (req, res) => {
  res.json({
    name: 'Remote Playwright MCP Server',
    version: '1.0.0',
    description: 'Microsoft Playwright MCP Server accessible from anywhere',
    endpoints: {
      websocket: `/ws?token=${ACCESS_TOKEN}`,
      status: '/api/status',
      start: '/api/start',
      stop: '/api/stop'
    },
    authentication: 'Bearer token required'
  });
});

app.get('/api/status', authenticateToken, (req, res) => {
  res.json({
    mcpServer: {
      running: mcpProcess !== null,
      pid: mcpProcess ? mcpProcess.pid : null
    },
    connections: activeConnections.size,
    uptime: process.uptime()
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
  stopMCPServer();
  res.json({ 
    status: 'MCP Server stopped',
    running: false
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Remote Playwright MCP Server running on port ${PORT}`);
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
  stopMCPServer();
  
  // Close all WebSocket connections
  activeConnections.forEach(ws => {
    ws.close();
  });
  
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export { app, wss, startMCPServer, stopMCPServer };
