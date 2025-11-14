function getBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => { resolve(body); });
  });
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const path = req.url || req.path || '';
  if (req.method !== 'POST' || (path !== '/api/chat' && path !== '/chat')) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const bodyStr = typeof req.body === 'string' ? req.body : await getBody(req);
    const { messages, temperature = 0.2, max_tokens = 800 } = JSON.parse(bodyStr || '{}');
    
    const apiKey = process.env.YANDEX_API_KEY;
    const folderId = process.env.YANDEX_FOLDER_ID;
    
    if (!apiKey || !folderId) {
      return res.status(500).json({ error: 'LLM client misconfigured' });
    }

    const payload = {
      modelUri: `gpt://${folderId}/yandexgpt-lite`,
      completionOptions: {
        stream: false,
        temperature: temperature,
        maxTokens: max_tokens,
      },
      messages: messages,
    };

    const response = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(502).json({ error: `LLM API error: ${errorText}` });
    }

    const data = await response.json();
    const reply = data?.result?.alternatives?.[0]?.message?.text;
    
    if (!reply) {
      return res.status(500).json({ error: 'Malformed response from LLM' });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

