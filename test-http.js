// HTTP API test script
import fetch from 'node-fetch';

const serverUrl = 'http://localhost:3000';
const authToken = 'pawan';

async function testHTTPAPI() {
  try {
    // Test health endpoint
    console.log('Testing health endpoint...');
    const health = await fetch(`${serverUrl}/health`);
    console.log('Health:', await health.json());

    // Test browser launch
    console.log('\nTesting browser launch...');
    const launch = await fetch(`${serverUrl}/tool/launch_browser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        browserType: 'chromium',
        sessionId: 'test-session-123',
        headless: true
      })
    });
    console.log('Launch Result:', await launch.json());

    // Test navigation
    console.log('\nTesting navigation...');
    const navigate = await fetch(`${serverUrl}/tool/navigate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        sessionId: 'test-session-123',
        url: 'https://example.com'
      })
    });
    console.log('Navigate Result:', await navigate.json());

    // Test screenshot
    console.log('\nTesting screenshot...');
    const screenshot = await fetch(`${serverUrl}/tool/screenshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        sessionId: 'test-session-123',
        fullPage: false
      })
    });
    console.log('Screenshot Result:', await screenshot.json());

    // Close browser
    console.log('\nClosing browser...');
    const close = await fetch(`${serverUrl}/tool/close_browser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        sessionId: 'test-session-123'
      })
    });
    console.log('Close Result:', await close.json());

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testHTTPAPI();