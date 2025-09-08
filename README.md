# MCP Playwright Server

A simple and clean Model Context Protocol (MCP) server that provides Playwright browser automation capabilities.

## Features

- **Browser Automation**: Launch and control Chromium, Firefox, or WebKit browsers
- **Remote Access**: HTTP and WebSocket APIs for cross-platform access
- **Session Management**: Multi-session support with unique session IDs
- **Screenshot Capture**: Full page and viewport screenshots
- **DOM Interaction**: Click, fill forms, extract text, and execute JavaScript
- **Docker Ready**: Containerized deployment with Docker Compose

## Quick Start

### Local Development

1. Install dependencies:
```bash
npm install
npm run install-browsers
```

2. Run as MCP server:
```bash
npm start
```

3. Run as HTTP/WebSocket server:
```bash
MODE=remote npm start
```

### Docker Deployment

```bash
docker-compose up -d
```

## Usage

### Available Tools

- `launch_browser` - Launch a new browser instance
- `navigate` - Navigate to a URL
- `screenshot` - Take page screenshots
- `click` - Click DOM elements
- `fill` - Fill form inputs
- `get_text` - Extract text content
- `evaluate` - Execute JavaScript
- `close_browser` - Close browser session

### Client Example

```javascript
import { PlaywrightMCPClient } from './client-example.js';

const client = new PlaywrightMCPClient('http://localhost:3000');

await client.launchBrowser('chromium');
await client.navigate('https://example.com');
const screenshot = await client.screenshot();
await client.closeBrowser();
```

## Configuration

Environment variables:
- `MODE` - 'mcp' or 'remote' (default: 'mcp')
- `HTTP_PORT` - HTTP server port (default: 3000)
- `AUTH_TOKEN` - Authentication token
- `NODE_ENV` - Environment mode

## License

MIT