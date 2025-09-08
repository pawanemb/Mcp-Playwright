# Connect to Claude Desktop

## Step 1: Find Claude Desktop Config File

**On macOS:**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**On Windows:**
```bash
%APPDATA%\Claude\claude_desktop_config.json
```

**On Linux:**
```bash
~/.config/claude/claude_desktop_config.json
```

## Step 2: Add MCP Server Configuration

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"],
      "cwd": "/Users/pawan/Downloads/Live-Collaborative-AI-Editor-app-main"
    }
  }
}
```

## Step 3: Restart Claude Desktop

1. Close Claude Desktop completely
2. Reopen Claude Desktop
3. The Playwright MCP server will be available

## Step 4: Test Connection

In Claude Desktop, you can now:
- Ask Claude to browse websites
- Take screenshots
- Automate browser tasks
- Extract data from web pages

## Example Commands

Try these in Claude Desktop:
- "Take a screenshot of google.com"
- "Navigate to github.com and find the trending repositories"
- "Fill out a form on example.com"

## Troubleshooting

If it doesn't work:
1. Make sure Node.js 18+ is installed
2. Run `npm install` in this directory
3. Run `npm run install-playwright`
4. Check the config file path is correct
5. Restart Claude Desktop

## Alternative: Use Local Script

You can also use the local startup script:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": ["start-mcp.js"],
      "cwd": "/Users/pawan/Downloads/Live-Collaborative-AI-Editor-app-main"
    }
  }
}
```
