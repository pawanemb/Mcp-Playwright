# Microsoft Playwright MCP Server

Simple, lightweight Microsoft Playwright MCP (Model Context Protocol) server that can be connected from anywhere.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Install Playwright browsers:**
   ```bash
   npm run install-playwright
   ```

3. **Start the MCP server:**
   ```bash
   npm start
   ```

## Connection

The MCP server will start and be available for connections. You can connect to it from:

- **Claude Desktop** - Add to your MCP configuration
- **Any MCP client** - Use the server endpoint
- **OpenAI API calls** - Integrate with your applications

## Configuration

### For Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"],
      "cwd": "/path/to/this/directory"
    }
  }
}
```

### For other MCP clients

The server runs on the default MCP protocol and can be connected to using standard MCP client libraries.

## Features

- ✅ **Lightweight** - Minimal dependencies
- ✅ **Accessibility-driven** - Built-in accessibility features
- ✅ **Official** - Microsoft maintained
- ✅ **Easy setup** - One command to start
- ✅ **Fast** - Optimized for production use

## Commands

- `npm start` - Start the MCP server
- `npm run mcp` - Run MCP server directly
- `npm run install-playwright` - Install Playwright browsers

## Requirements

- Node.js 18 or higher
- Internet connection for browser automation

## Troubleshooting

If you encounter issues:

1. Make sure Node.js 18+ is installed
2. Run `npm run install-playwright` to install browsers
3. Check that no other MCP server is running on the same port

## License

MIT
