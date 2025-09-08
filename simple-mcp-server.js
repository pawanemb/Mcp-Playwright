#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting Microsoft Playwright MCP Server...');
console.log('📡 Server will be available for MCP connections');
console.log('');

let mcpProcess = null;
let restartCount = 0;
const maxRestarts = 10;

function startMCPServer() {
  if (mcpProcess) {
    mcpProcess.kill();
  }

  console.log(`🔄 Starting MCP Server (attempt ${restartCount + 1})...`);
  
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
    console.error(`MCP Error: ${data.toString().trim()}`);
  });

  mcpProcess.on('error', (error) => {
    console.error('❌ Failed to start MCP Server:', error.message);
    if (restartCount < maxRestarts) {
      restartCount++;
      console.log(`🔄 Restarting in 5 seconds... (${restartCount}/${maxRestarts})`);
      setTimeout(startMCPServer, 5000);
    } else {
      console.error('❌ Max restart attempts reached. Exiting.');
      process.exit(1);
    }
  });

  mcpProcess.on('close', (code) => {
    console.log(`🛑 MCP Server stopped with code ${code}`);
    if (code !== 0 && restartCount < maxRestarts) {
      restartCount++;
      console.log(`🔄 Restarting in 5 seconds... (${restartCount}/${maxRestarts})`);
      setTimeout(startMCPServer, 5000);
    } else {
      console.log('✅ MCP Server process completed');
      // Keep the container running even if MCP server exits
      console.log('💓 Container will stay alive for MCP connections...');
    }
  });
}

// Start the server
startMCPServer();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down MCP Server...');
  if (mcpProcess) {
    mcpProcess.kill('SIGINT');
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Terminating MCP Server...');
  if (mcpProcess) {
    mcpProcess.kill('SIGTERM');
  }
  process.exit(0);
});

// Keep the process alive
setInterval(() => {
  console.log('💓 MCP Server container is alive...');
}, 30000);
