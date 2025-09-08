#!/usr/bin/env node

import express from 'express';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

let mcpProcess = null;
let mcpStatus = 'stopped';

// Start MCP Server
function startMCPServer() {
  if (mcpProcess) {
    mcpProcess.kill();
  }

  console.log('🚀 Starting Microsoft Playwright MCP Server...');
  mcpStatus = 'starting';
  
  mcpProcess = spawn('npx', ['@playwright/mcp@latest'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: __dirname,
    env: {
      ...process.env,
      NODE_ENV: 'production'
    }
  });

  mcpProcess.stdout.on('data', (data) => {
    console.log(`MCP: ${data.toString().trim()}`);
  });

  mcpProcess.stderr.on('data', (data) => {
    console.log(`MCP: ${data.toString().trim()}`);
  });

  mcpProcess.on('error', (error) => {
    console.error('❌ Failed to start MCP Server:', error.message);
    mcpStatus = 'error';
  });

  mcpProcess.on('close', (code) => {
    console.log(`🛑 MCP Server stopped with code ${code}`);
    mcpStatus = 'stopped';
  });

  // Give it a moment to start
  setTimeout(() => {
    if (mcpProcess && !mcpProcess.killed) {
      mcpStatus = 'running';
      console.log('✅ MCP Server is running');
    }
  }, 2000);
}

// Routes
app.get('/', (req, res) => {
  res.json({
    name: 'Microsoft Playwright MCP Server',
    version: '1.0.0',
    status: 'running',
    mcpStatus: mcpStatus,
    endpoints: {
      health: '/health',
      status: '/status',
      start: '/start',
      stop: '/stop'
    },
    message: 'MCP Server is running and ready for connections'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mcpStatus: mcpStatus,
    uptime: process.uptime()
  });
});

app.get('/status', (req, res) => {
  res.json({
    mcpStatus: mcpStatus,
    mcpProcess: mcpProcess ? {
      pid: mcpProcess.pid,
      killed: mcpProcess.killed
    } : null,
    uptime: process.uptime()
  });
});

app.post('/start', (req, res) => {
  startMCPServer();
  res.json({
    message: 'MCP Server start requested',
    status: mcpStatus
  });
});

app.post('/stop', (req, res) => {
  if (mcpProcess) {
    mcpProcess.kill();
    mcpStatus = 'stopped';
  }
  res.json({
    message: 'MCP Server stopped',
    status: mcpStatus
  });
});

// Start the HTTP server
app.listen(PORT, () => {
  console.log(`🚀 HTTP Server running on port ${PORT}`);
  console.log(`📡 MCP Server will be available for connections`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  
  // Start MCP server
  startMCPServer();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  if (mcpProcess) {
    mcpProcess.kill();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Terminating...');
  if (mcpProcess) {
    mcpProcess.kill();
  }
  process.exit(0);
});
