# 🚀 Deploy to Coolify - Fast Testing Guide

## Step 1: Prepare Your Repository

1. **Push to GitHub/GitLab:**
   ```bash
   git init
   git add .
   git commit -m "Initial MCP server setup"
   git remote add origin https://github.com/yourusername/your-repo.git
   git push -u origin main
   ```

## Step 2: Coolify Setup

### Option A: GitHub Integration
1. **Login to Coolify**
2. **Click "New Resource"**
3. **Select "GitHub"**
4. **Connect your GitHub account**
5. **Select your repository**

### Option B: Git URL
1. **Click "New Resource"**
2. **Select "Git Repository"**
3. **Enter your Git URL:**
   ```
   https://github.com/yourusername/your-repo.git
   ```

## Step 3: Configure Application

### **Application Settings:**
- **Name**: `playwright-mcp-server`
- **Build Pack**: `Dockerfile`
- **Port**: `3000`
- **Domain**: `your-app.coolify.io` (or custom domain)

### **Environment Variables:**
Add these in Coolify dashboard:

```
PORT=3000
NODE_ENV=production
ACCESS_TOKEN=your-secure-token-here
JWT_SECRET=your-jwt-secret-key
```

### **Build Settings:**
- **Dockerfile Path**: `./Dockerfile`
- **Build Context**: `.`
- **Docker Compose**: No

## Step 4: Deploy

1. **Click "Deploy"**
2. **Wait for build** (2-3 minutes)
3. **Check logs** for successful startup
4. **Test your deployment**

## Step 5: Test Your Deployment

### **Health Check:**
```bash
curl https://your-app.coolify.io/api/health
```

### **Status Check:**
```bash
curl -H "Authorization: Bearer your-secure-token-here" \
     https://your-app.coolify.io/api/status
```

### **WebSocket Test:**
```bash
# Use a WebSocket client to test:
# wss://your-app.coolify.io/ws?token=your-secure-token-here
```

## Step 6: Configure Claude Desktop

Update your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my_mcp_server": {
      "url": "https://your-app.coolify.io",
      "description": "My Coolify MCP Server",
      "headers": {
        "Authorization": "Bearer your-secure-token-here"
      }
    }
  }
}
```

## 🎯 Quick Deploy Commands

### **If using Coolify CLI:**
```bash
# Install Coolify CLI
npm install -g @coolify/cli

# Login
coolify login

# Deploy
coolify deploy --repo your-repo --token your-secure-token-here
```

## 🔧 Troubleshooting

### **Build Issues:**
- Check Dockerfile syntax
- Ensure all dependencies are in package.json
- Verify Node.js version compatibility

### **Runtime Issues:**
- Check environment variables
- Verify port configuration
- Check application logs in Coolify

### **Connection Issues:**
- Verify HTTPS/SSL certificate
- Check CORS settings
- Test with curl commands

## ✨ Features After Deployment

- ✅ **HTTPS enabled** automatically
- ✅ **Custom domain** support
- ✅ **Auto-scaling** capabilities
- ✅ **SSL certificates** managed
- ✅ **Monitoring** and logs
- ✅ **Easy updates** via Git push

## 🚀 Fast Testing Workflow

1. **Make changes** to your code
2. **Push to Git** repository
3. **Coolify auto-deploys** (if enabled)
4. **Test immediately** on live URL
5. **Update Claude Desktop** config if needed

Your MCP server will be live and accessible from anywhere! 🎉
