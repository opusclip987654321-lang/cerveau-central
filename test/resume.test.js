import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumeQuotidien } from '../src/resume.js';

const maintenant = new Date('2026-10-05T09:00:00Z');

test('résumé : tout va bien', () => {
  const etat = { derniereVerification: '2026-10-05T08:00:00Z', verifications: { a: { nom: 'Site', etat: 'ok', detail: 'ok' } }, historique: [] };
  const t = resumeQuotidien(etat, 21, maintenant);
  assert.match(t, /🟢 Tout tourne/);
  assert.match(t, /aucun incident/);
  assert.match(t, /21 question\(s\) du jour/);
});

test('résumé : pannes, points à surveiller et incidents récents', () => {
  const etat = {
    derniereVerification: '2026-10-05T08:00:00Z',
    verifications: {
      a: { nom: 'Site leviaro.fr', etat: 'panne', detail: 'répond 502' },
      b: { nom: 'Espace disque', etat: 'attention', detail: '88 % utilisé' },
    },
    historique: [
      { date: '2026-10-05T07:00:00Z', type: 'panne' },
      { date: '2026-10-05T07:30:00Z', type: 'retabli' },
      { date: '2026-10-01T07:00:00Z', type: 'panne' },
    ],
  };
  const t = resumeQuotidien(etat, 0, maintenant);
  assert.match(t, /🔴 1 panne\(s\) en cours :\n• Site leviaro.fr : répond 502/);
  assert.match(t, /🟠 À surveiller :\n• Espace disque/);
  assert.match(t, /1 incident\(s\)/);
  assert.doesNotMatch(t, /question/);
});
