// Test script to verify session management improvements
import fetch from 'node-fetch';

const serverUrl = 'http://localhost:3000';

async function testSessionManagement() {
  console.log('🧪 Testing Session Management Improvements\n');

  try {
    // Test 1: Health check with session stats
    console.log('1. Testing health endpoint with session stats...');
    const health = await fetch(`${serverUrl}/health`);
    const healthData = await health.json();
    console.log('✅ Health:', JSON.stringify(healthData, null, 2));

    // Test 2: Concurrent session creation (same sessionId)
    console.log('\n2. Testing concurrent session creation prevention...');
    const sessionId = 'test-concurrent-' + Date.now();
    
    const concurrentPromises = [
      callMCPTool('launch_browser', { sessionId, browserType: 'chromium' }),
      callMCPTool('launch_browser', { sessionId, browserType: 'chromium' }),
      callMCPTool('launch_browser', { sessionId, browserType: 'chromium' })
    ];

    const results = await Promise.allSettled(concurrentPromises);
    console.log('✅ Concurrent results:', results.map(r => r.status === 'fulfilled' ? 'SUCCESS' : 'ERROR'));

    // Test 3: Auto-launch with different tools
    console.log('\n3. Testing auto-launch with different tools...');
    const autoSessionId = 'auto-launch-' + Date.now();
    
    const autoResult = await callMCPTool('navigate', { 
      sessionId: autoSessionId, 
      url: 'https://example.com' 
    });
    console.log('✅ Auto-launch navigate:', autoResult.status === 'fulfilled' ? 'SUCCESS' : 'ERROR');

    // Test 4: Session stats
    console.log('\n4. Testing session stats endpoint...');
    const sessions = await fetch(`${serverUrl}/sessions`);
    const sessionData = await sessions.json();
    console.log('✅ Session Stats:', JSON.stringify(sessionData, null, 2));

    // Test 5: Session validation
    console.log('\n5. Testing session operations...');
    const pageResult = await callMCPTool('get_text', { 
      sessionId: autoSessionId, 
      selector: 'h1' 
    });
    console.log('✅ Page operation:', pageResult.status === 'fulfilled' ? 'SUCCESS' : 'ERROR');

    // Test 6: Cleanup
    console.log('\n6. Testing session cleanup...');
    const cleanupResult = await callMCPTool('close_browser', { sessionId: autoSessionId });
    console.log('✅ Cleanup:', cleanupResult.status === 'fulfilled' ? 'SUCCESS' : 'ERROR');

    // Final session stats
    console.log('\n7. Final session stats...');
    const finalSessions = await fetch(`${serverUrl}/sessions`);
    const finalData = await finalSessions.json();
    console.log('✅ Final Stats:', JSON.stringify(finalData, null, 2));

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

async function callMCPTool(toolName, args) {
  try {
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer pawan'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Math.random(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      })
    });

    return { status: 'fulfilled', data: await response.json() };
  } catch (error) {
    return { status: 'rejected', error: error.message };
  }
}

testSessionManagement();