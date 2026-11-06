// Envoie un message Telegram par l'API officielle des bots.

export async function envoyerTelegram(texte, { token, chatId, api = 'https://api.telegram.org' } = {}) {
  if (!token || !chatId) {
    console.log(`[telegram non configuré] ${texte}`);
    return false;
  }
  const r = await fetch(`${api}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texte, parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) {
    console.error(`Telegram a refusé le message (${r.status}) : ${await r.text()}`);
    return false;
  }
  return true;
}

// Le bot et la conversation des alertes Nūr Meet : le bot Nūr Meet s'il est configuré,
// sinon le bot du cerveau. La conversation par défaut reste celle du cerveau.
export function telegramNour(env = {}) {
  const token = env.TELEGRAM_NOUR_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_NOUR_CHAT_ID || env.TELEGRAM_CHAT_ID;
  return { token, chatId };
}
