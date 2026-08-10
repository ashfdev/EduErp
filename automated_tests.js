const http = require('http');

const API_URL = 'http://localhost:4000';

async function request(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    const req = http.request(`${API_URL}${path}`, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          data: data ? data : null
        });
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log("🚀 Starting EduErp Automated Pre-Launch Test Suite\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Test Horizontal Escalation (Permissions)
    console.log("--- 1. Security: Horizontal Escalation ---");
    const adminRes = await request('/api/students', 'GET'); // Admin only route
    assert(
      adminRes.status === 401 || adminRes.status === 403, 
      `Accessing admin route without token should return 401/403. (Got ${adminRes.status})`
    );

    // 2. Test Rate Limiting / Brute Force Protection
    console.log("\n--- 2. Security: Brute Force Protection ---");
    let rateLimited = false;
    // The login limiter is 5 fails / 15 min. So sending 10 should trigger a 429 on the 6th.
    for (let i = 0; i < 10; i++) {
      const loginRes = await request('/api/auth/login', 'POST', {
        phone: '01700000000',
        password: 'wrong_password_test'
      });
      if (loginRes.status === 429) {
        rateLimited = true;
        break;
      }
    }
    assert(rateLimited, "Brute force login attempt should trigger 429 Too Many Requests IP Ban.");

    // 3. Test Performance Throughput
    console.log("\n--- 3. Performance: API Query Throughput ---");
    const CONCURRENT = 200;
    const start = Date.now();
    const reqs = Array.from({length: CONCURRENT}).map(() => request('/health'));
    const results = await Promise.all(reqs);
    const duration = Date.now() - start;
    
    const allSuccess = results.every(r => r.status === 200);
    assert(allSuccess, `${CONCURRENT} concurrent queries completed successfully.`);
    assert(duration < 1000, `Throughput test completed extremely fast (took ${duration}ms for ${CONCURRENT} requests).`);

  } catch (error) {
    console.error("Test execution failed:", error);
  }

  console.log(`\n🏁 Test Suite Finished. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
