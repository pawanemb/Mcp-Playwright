# Remote MCP Server Setup

## 🌐 Make Your MCP Server Accessible from Anywhere

### 1. **Local Testing**
```bash
# Install dependencies
npm install

# Set up environment
cp env.example .env
# Edit .env with your access token

# Start the remote server
npm start
```

### 2. **Deploy to Cloud (Choose One)**

#### Option A: Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

#### Option B: Heroku
```bash
# Install Heroku CLI
# Create Procfile
echo "web: node remote-mcp-server.js" > Procfile

# Deploy
heroku create your-mcp-server
git push heroku main
```

#### Option C: Vercel
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

#### Option D: DigitalOcean App Platform
- Create new app
- Connect GitHub repo
- Set environment variables
- Deploy

### 3. **Configure Claude Desktop**

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my_mcp_server": {
      "url": "https://your-domain.com",
      "description": "My Remote Playwright MCP Server",
      "headers": {
        "Authorization": "Bearer your-secret-token-here"
      }
    }
  }
}
```

### 4. **Environment Variables**

Set these in your hosting platform:

```
PORT=3000
ACCESS_TOKEN=your-secret-token-here
JWT_SECRET=your-jwt-secret-key
NODE_ENV=production
```

### 5. **Test Your Remote Server**

```bash
# Check if server is running
curl https://your-domain.com/api/health

# Test with authentication
curl -H "Authorization: Bearer your-secret-token-here" \
     https://your-domain.com/api/status
```

## 🔧 Features

- ✅ **Remote Access** - Use from anywhere
- ✅ **Authentication** - Secure with access tokens
- ✅ **WebSocket Support** - Real-time communication
- ✅ **REST API** - HTTP endpoints for control
- ✅ **Auto-start MCP** - Playwright server starts automatically
- ✅ **Multiple Connections** - Support multiple clients

## 📡 Endpoints

- `GET /` - Server info
- `GET /api/status` - Server status (requires auth)
- `POST /api/start` - Start MCP server (requires auth)
- `POST /api/stop` - Stop MCP server (requires auth)
- `GET /api/health` - Health check
- `WS /ws?token=...` - WebSocket connection

## 🔐 Security

- Access token authentication
- CORS enabled
- Secure WebSocket connections
- Environment variable configuration

## 🚀 Quick Deploy

1. **Set your access token** in `.env`
2. **Deploy to your preferred platform**
3. **Update Claude Desktop config** with your URL
4. **Restart Claude Desktop**
5. **Start using remote MCP server!**

Your MCP server will now be accessible from anywhere with the URL and access token!
