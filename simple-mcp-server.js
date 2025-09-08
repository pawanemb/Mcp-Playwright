#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting Microsoft Playwright MCP Server...');
console.log('📡 Server will be available for MCP connections');
console.log('');

// Start the official Microsoft Playwright MCP server
const mcpProcess = spawn('npx', ['@playwright/mcp@latest'], {
  stdio: 'inherit',
  cwd: __dirname,
  env: {
    ...process.env,
    NODE_ENV: 'production'
  }
});

// Handle process events
mcpProcess.on('error', (error) => {
  console.error('❌ Failed to start MCP Server:', error.message);
  process.exit(1);
});

mcpProcess.on('close', (code) => {
  console.log(`\n🛑 MCP Server stopped with code ${code}`);
  process.exit(code);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down MCP Server...');
  mcpProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Terminating MCP Server...');
  mcpProcess.kill('SIGTERM');
});
