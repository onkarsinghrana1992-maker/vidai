const crypto = require('crypto');

const PLANS = {
  basic:  { amountPaise: 39900,  credits: 250,  label: 'Basic Plan' },
  pro:    { amountPaise: 79900,  credits: 600,  label: 'Pro Plan' },
  studio: { amountPaise: 199900, credits: 2000, label: 'Studio Plan' }
};

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    const { plan, userId, userEmail } = JSON.parse(event.body);

    if (!PLANS[plan]) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid plan' }) };

    const planInfo        = PLANS[plan];
    const merchantId      = process.env.PHONEPE_MERCHANT_ID;
    const saltKey         = process.env.PHONEPE_API_KEY;
    const saltIndex       = process.env.PHONEPE_SALT_INDEX || '1';
    const siteUrl         = process.env.URL || 'https://rococo-crisp-64b925.netlify.app';

    if (!merchantId || !saltKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Payment config missing in Netlify env' }) };
    }

    const merchantTransactionId = 'VIDAI' + Date.now() + Math.random().toString(36).substring(2, 6).toUpperCase();

    const payload = {
      merchantId,
      merchantTransactionId,
      merchantUserId: userId || 'USER_' + Date.now(),
      amount: planInfo.amountPaise,
      redirectUrl: `${siteUrl}/?payment=success&plan=${plan}&credits=${planInfo.credits}&txn=${merchantTransactionId}`,
      redirectMode: 'REDIRECT',
      callbackUrl: `${siteUrl}/.netlify/functions/payment-callback`,
      mobileNumber: '',
      paymentInstrument: { type: 'PAY_PAGE' }
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const hashString    = base64Payload + '/pg/v1/pay' + saltKey;
    const sha256Hash    = crypto.createHash('sha256').update(hashString).digest('hex');
    const xVerify       = sha256Hash + '###' + saltIndex;

    const response = await fetch('https://api.phonepe.com/apis/hermes/pg/v1/pay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': xVerify
      },
      body: JSON.stringify({ request: base64Payload })
    });

    const data = await response.json();

    if (data.success && data.data && data.data.instrumentResponse && data.data.instrumentResponse.redirectInfo) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ redirectUrl: data.data.instrumentResponse.redirectInfo.url })
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: data.message || 'PhonePe payment initiation failed', raw: data })
    };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
