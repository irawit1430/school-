const fetch = require('node-fetch');

async function test() {
  try {
    const loginRes = await fetch('https://gps-backend-jzd7.onrender.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'principal@example.com', password: 'password123' })
    });
    
    const loginData = await loginRes.json();
    
    if (loginData.token) {
      const searchRes = await fetch('https://gps-backend-jzd7.onrender.com/api/search?q=rohan', {
        headers: { 'Authorization': `Bearer ${loginData.token}` }
      });
      const searchData = await searchRes.json();
      console.log('Search Result:', JSON.stringify(searchData, null, 2));
    }
  } catch (e) {
    console.error(e);
  }
}
test();
