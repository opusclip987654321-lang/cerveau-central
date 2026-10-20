import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ajouterMessage, cocher, tousLesMessages, nombreAFaire, htmlAColler } from '../src/a-coller.js';
import { gabarit } from '../src/page.js';

const config = JSON.parse(await readFile(new URL('../config/a-coller.json', import.meta.url), 'utf8')).messages;

test('les messages de la config sont complets, uniques et sans secret', () => {
  const ids = new Set();
  for (const m of config) {
    assert.ok(/^[a-z0-9][a-z0-9-]{2,79}$/.test(m.id), `id invalide : ${m.id}`);
    assert.ok(!ids.has(m.id), `id en double : ${m.id}`);
    ids.add(m.id);
    assert.ok(m.projet && m.texte && /^\d{4}-\d{2}-\d{2}$/.test(m.date), `message incomplet : ${m.id}`);
    assert.doesNotMatch(m.texte, /ntn_|sk-ant-|RELEVE_JETON=|@gmail\.com/, `secret ou adresse dans ${m.id}`);
  }
});

test('fait / à faire : coche, décoche, et la coche l’emporte sur la config', () => {
  const d = { messages: [], faits: {} };
  const msgs = [{ id: 'a-1', projet: 'Leviaro', date: '2026-10-20', texte: 'x' }, { id: 'b-2', projet: 'Leviaro', date: '2026-10-19', texte: 'y', fait: '2026-10-19' }];
  assert.equal(nombreAFaire(tousLesMessages(msgs, d)), 1);
  cocher(d, 'a-1', true, new Date('2026-10-21T10:00:00Z'));
  cocher(d, 'b-2', false);
  const t = tousLesMessages(msgs, d);
  assert.equal(t.find((m) => m.id === 'a-1').fait, '2026-10-21T10:00:00.000Z');
  assert.equal(t.find((m) => m.id === 'b-2').fait, null);
});

test('API : ajout, mise à jour au même id, refus des messages vides', () => {
  const d = { messages: [], faits: {} };
  assert.equal(ajouterMessage(d, { texte: 'x' }).erreur, 'Projet cible manquant.');
  assert.equal(ajouterMessage(d, { projet: 'Leviaro', texte: '  ' }).erreur, 'Texte vide.');
  ajouterMessage(d, { id: 'leviaro-test', projet: 'Leviaro', texte: 'v1', date: '2026-10-20' });
  ajouterMessage(d, { id: 'leviaro-test', projet: 'Leviaro', texte: 'v2', date: '2026-10-20' });
  assert.equal(d.messages.length, 1);
  assert.equal(d.messages[0].texte, 'v2');
  const { message } = ajouterMessage(d, { id: 'PAS BON', projet: 'VégéBudget', texte: 'z' }, new Date('2026-10-22T08:00:00Z'));
  assert.match(message.id, /^[0-9a-f]{12}$/);
  assert.equal(message.date, '2026-10-22');
  // Un message de l'API remplace celui de la config au même id.
  const t = tousLesMessages([{ id: 'leviaro-test', projet: 'Leviaro', texte: 'ancien', date: '2026-10-19' }], d);
  assert.equal(t.filter((m) => m.id === 'leviaro-test').length, 1);
  assert.equal(t.find((m) => m.id === 'leviaro-test').texte, 'v2');
});

test('la page : à faire par projet, bouton copier, faits repliés, texte échappé', () => {
  const messages = tousLesMessages(config, { messages: [{ id: 'piege', projet: 'Leviaro', date: '2026-10-20', texte: '<script>alert(1)</script>' }], faits: {} });
  const html = htmlAColler(messages);
  assert.match(html, /<h3>3_PETITES HISTOIRES <small>/);
  assert.match(html, /fil « Production automatique »/);
  assert.match(html, /Copier le message/);
  assert.match(html, /<details class="faits"><summary>Déjà collés \(3\)<\/summary>/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(htmlAColler([]), /Rien à coller/);
  // Le menu montre combien il en reste.
  assert.match(gabarit({ onglet: 'a-coller', aColler: nombreAFaire(messages), contenu: html }), /href="\/a-coller" class="actif" data-s="⧉">À coller <span class="badge">6<\/span>/);
});
