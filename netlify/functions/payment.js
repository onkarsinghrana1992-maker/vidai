exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const PLANS = {
    basic:  { amountPaise: 39900,  credits: 250  },
    pro:    { amountPaise: 79900,  credits: 600  },
    studio: { amountPaise: 199900, credits: 2000 }
  };

  try {
    const { plan, userId, userEmail } = JSON.parse(event.body);
    if (!PLANS[plan]) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid plan' }) };

    const planInfo      = PLANS[plan];
    const clientId      = process.env.PHONEPE_CLIENT_ID;
    const clientSecret  = process.env.PHONEPE_CLIENT_SECRET;
    const clientVersion = process.env.PHONEPE_CLIENT_VERSION || '1';
    const siteUrl       = process.env.URL || 'https://rococo-crisp-64b925.netlify.app';

    // Step 1: OAuth token
    const tokenRes = await fetch('https://api.phonepe.com/apis/identity-manager/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        client_version: clientVersion,
        grant_type: 'client_credentials'
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Token fetch failed', raw: tokenData }) };
    }

    const merchantOrderId = 'VIDAI' + Date.now() + Math.random().toString(36).substring(2,6).toUpperCase();

    // Step 2: Create payment
    const orderRes = await fetch('https://api.phonepe.com/apis/pg/checkout/v2/pay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `O-Bearer ${tokenData.access_token}`
      },
      body: JSON.stringify({
        merchantOrderId,
        amount: planInfo.amountPaise,
        expireAfter: 1200,
        paymentFlow: {
          type: 'PG_CHECKOUT',
          message: `VidAI ${plan} Plan`,
          merchantUrls: {
            redirectUrl: `${siteUrl}/?payment=success&plan=${plan}&credits=${planInfo.credits}&txn=${merchantOrderId}`
          }
        }
      })
    });

    const orderData = await orderRes.json();

    if (orderData.redirectUrl) {
      return { statusCode: 200, headers, body: JSON.stringify({ redirectUrl: orderData.redirectUrl }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Order failed', raw: orderData }) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
