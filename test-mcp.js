// MCP Inspector test script
import { spawn } from 'child_process';

const server = spawn('node', ['server.js'], {
  env: { ...process.env, MODE: 'mcp' },
  stdio: ['pipe', 'pipe', 'inherit']
});

// Test MCP protocol
const testCommands = [
  '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0.0"}}}',
  '{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}',
  '{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "launch_browser", "arguments": {"browserType": "chromium", "sessionId": "test-123", "headless": true}}}'
];

testCommands.forEach((cmd, i) => {
  setTimeout(() => {
    console.log(`Sending: ${cmd}`);
    server.stdin.write(cmd + '\n');
  }, i * 1000);
});

server.stdout.on('data', (data) => {
  console.log('Response:', data.toString());
});

setTimeout(() => {
  server.kill();
}, 5000);