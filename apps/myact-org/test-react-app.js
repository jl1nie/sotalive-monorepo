#!/usr/bin/env node

const { execSync } = require('child_process');
const http = require('http');

function testURL(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function main() {
  console.log('🔍 Testing React application...\n');
  
  try {
    // Test preview server
    console.log('📡 Testing preview server at http://localhost:4173/myact/');
    const response = await testURL('http://localhost:4173/myact/');
    
    console.log(`✅ Status: ${response.statusCode}`);
    console.log(`📄 Content length: ${response.body.length} characters`);
    
    // Check if the HTML contains React root element
    const hasReactRoot = response.body.includes('<div id="root">');
    const hasReactScript = response.body.includes('assets/index-') && response.body.includes('.js');
    const hasAlertSpotContent = response.body.includes('アラート') || response.body.includes('Alert');
    
    console.log(`🔰 React root element: ${hasReactRoot ? '✅' : '❌'}`);
    console.log(`📦 React script bundle: ${hasReactScript ? '✅' : '❌'}`);
    console.log(`🏷️  Alert/Spot content: ${hasAlertSpotContent ? '✅' : '❌'}`);
    
    if (hasReactRoot && hasReactScript) {
      console.log('\n🎉 React application appears to be properly configured!');
      console.log('📍 You can now access it at: http://localhost:4173/myact/');
      
      // Extract title
      const titleMatch = response.body.match(/<title>(.*?)<\/title>/);
      if (titleMatch) {
        console.log(`📑 Page title: ${titleMatch[1]}`);
      }
      
      // Check for script bundles
      const scriptMatches = response.body.match(/assets\/[^"]+\.js/g);
      if (scriptMatches) {
        console.log(`📦 Script bundles: ${scriptMatches.length} files`);
      }
      
    } else {
      console.log('\n❌ React application configuration issues detected');
    }
    
  } catch (error) {
    console.error(`❌ Error testing React app: ${error.message}`);
    
    // Check if preview server is running
    try {
      execSync('pgrep -f "vite preview"', { stdio: 'pipe' });
      console.log('📡 Preview server appears to be running');
    } catch {
      console.log('📡 Preview server may not be running. Try: npm run preview');
    }
  }
}

main().catch(console.error);