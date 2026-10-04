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
