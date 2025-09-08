import fetch from 'node-fetch';
import WebSocket from 'ws';

class PlaywrightMCPClient {
  constructor(serverUrl, options = {}) {
    this.serverUrl = serverUrl;
    this.wsUrl = serverUrl.replace('http', 'ws');
    this.authToken = options.authToken;
    this.sessionId = options.sessionId || this.generateSessionId();
    this.ws = null;
  }

  generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  async callTool(toolName, args) {
    const response = await fetch(`${this.serverUrl}/tool/${toolName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.authToken ? `Bearer ${this.authToken}` : undefined
      },
      body: JSON.stringify({ ...args, sessionId: this.sessionId })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  async launchBrowser(browserType = 'chromium', headless = true) {
    return await this.callTool('launch_browser', {
      browserType,
      headless,
      sessionId: this.sessionId
    });
  }

  async navigate(url) {
    return await this.callTool('navigate', { url });
  }

  async screenshot(fullPage = false) {
    return await this.callTool('screenshot', { fullPage });
  }

  async click(selector) {
    return await this.callTool('click', { selector });
  }

  async fill(selector, value) {
    return await this.callTool('fill', { selector, value });
  }

  async getText(selector) {
    return await this.callTool('get_text', { selector });
  }

  async evaluate(script) {
    return await this.callTool('evaluate', { script });
  }

  async closeBrowser() {
    return await this.callTool('close_browser', {});
  }

  connectWebSocket() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.on('open', () => {
        console.log('WebSocket connected');
        resolve();
      });
      
      this.ws.on('error', reject);
      
      this.ws.on('message', (data) => {
        const message = JSON.parse(data);
        console.log('Received:', message);
      });
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function example() {
  const client = new PlaywrightMCPClient('http://localhost:3000', {
    authToken: 'your-secret-token'
  });

  try {
    console.log('Launching browser...');
    await client.launchBrowser('chromium', true);

    console.log('Navigating to example.com...');
    await client.navigate('https://example.com');

    console.log('Taking screenshot...');
    const screenshot = await client.screenshot(true);
    console.log('Screenshot taken:', screenshot);

    const title = await client.getText('h1');
    console.log('Page title:', title);

    const result = await client.evaluate('document.title');
    console.log('Document title:', result);

    await client.closeBrowser();
    console.log('Browser closed');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.disconnect();
  }
}

export { PlaywrightMCPClient, example };