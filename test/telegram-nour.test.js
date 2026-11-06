import { test } from 'node:test';
import assert from 'node:assert/strict';
import { telegramNour } from '../src/telegram.js';

test('alertes Nūr Meet : bot Nūr Meet quand il est configuré', () => {
  const env = { TELEGRAM_BOT_TOKEN: 'cerveau', TELEGRAM_CHAT_ID: '1', TELEGRAM_NOUR_BOT_TOKEN: 'nour' };
  assert.deepEqual(telegramNour(env), { token: 'nour', chatId: '1' });
  assert.deepEqual(telegramNour({ ...env, TELEGRAM_NOUR_CHAT_ID: '2' }), { token: 'nour', chatId: '2' });
});

test('alertes Nūr Meet : bot du cerveau sans configuration', () => {
  assert.deepEqual(telegramNour({ TELEGRAM_BOT_TOKEN: 'cerveau', TELEGRAM_CHAT_ID: '1', TELEGRAM_NOUR_BOT_TOKEN: '' }), { token: 'cerveau', chatId: '1' });
});
