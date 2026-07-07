import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadGuestPrompt() {
  try {
    const promptPath = join(__dirname, '..', '..', 'server', 'guest-concierge-system-prompt.md');
    return await readFile(promptPath, 'utf-8');
  } catch (loadError) {
    console.error('[hermes-proxy] guest prompt load error:', loadError?.message ?? String(loadError));
    return null;
  }
}

async function callOpenRouter(prompt) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY || ''}`
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-exp:free',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error('OpenRouter returned empty completion');
  }
  return reply;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { message, context } = req.body ?? {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    let prompt = message;
    const normalizedContext = typeof context === 'string' ? context.toLowerCase().trim() : '';
    if (normalizedContext === 'guest-concierge') {
      const guestPrompt = await loadGuestPrompt();
      if (guestPrompt) {
        prompt = `${guestPrompt}\n\nGuest says: ${message}`;
      }
    }

    const reply = await callOpenRouter(prompt);
    return res.status(200).json({ reply });
  } catch (error) {
    console.error('Hermes error:', error);
    const errorMessage = error?.message ?? 'Agent failed.';
    return res.status(500).json({ error: errorMessage });
  }
}
