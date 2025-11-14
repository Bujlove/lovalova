function getBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => { resolve(body); });
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const path = req.url || req.path || '';
  if (req.method !== 'POST' || (path !== '/api/generate' && path !== '/generate')) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const bodyStr = typeof req.body === 'string' ? req.body : await getBody(req);
    const { prompt, projectFiles, currentFile } = JSON.parse(bodyStr || '{}');
    
    const apiKey = process.env.YANDEX_API_KEY;
    const folderId = process.env.YANDEX_FOLDER_ID;
    
    if (!apiKey || !folderId) {
      return res.status(500).json({ error: 'LLM client misconfigured' });
    }

    // Формируем системный промпт для генерации кода
    const systemPrompt = `Ты - эксперт по веб-разработке. Твоя задача - генерировать рабочий код для веб-сайтов.

Правила:
1. Генерируй только валидный код (HTML, CSS, JavaScript, React)
2. Код должен быть современным и чистым
3. Используй актуальные практики разработки
4. Если пользователь просит создать сайт - создай полноценную HTML страницу с CSS и JavaScript
5. Отвечай ТОЛЬКО кодом, без объяснений (если не просят объяснить)

Текущие файлы проекта:
${JSON.stringify(projectFiles || {}, null, 2)}

${currentFile ? `Работаем с файлом: ${currentFile}` : ''}`;

    const userPrompt = prompt || 'Создай простой красивый сайт-визитку';

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const payload = {
      modelUri: `gpt://${folderId}/yandexgpt-lite`,
      completionOptions: {
        stream: false,
        temperature: 0.3,
        maxTokens: 2000,
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
    const generatedCode = data?.result?.alternatives?.[0]?.message?.text;
    
    if (!generatedCode) {
      return res.status(500).json({ error: 'Malformed response from LLM' });
    }

    // Пытаемся извлечь код из ответа (убираем markdown блоки если есть)
    let code = generatedCode.trim();
    if (code.startsWith('```')) {
      const lines = code.split('\n');
      lines.shift(); // убираем первую строку с ```
      lines.pop(); // убираем последнюю строку с ```
      code = lines.join('\n').trim();
    }

    return res.status(200).json({ code, raw: generatedCode });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

