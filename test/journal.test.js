import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ajouterEvenement, synchroniserN8n, journee, bilanSemaine, messageHier, projetDuWorkflow } from '../src/journal.js';
import { pageJournal } from '../src/page-journal.js';

const config = JSON.parse(await readFile(new URL('../config/journal.json', import.meta.url), 'utf8'));
const vide = () => ({ evenements: [], n8n: { jours: {}, dernierId: null } });

test('événement envoyé par n8n : vérifié, daté à Paris, lien sûr seulement', () => {
  const j = vide();
  const { evenement } = ajouterEvenement(j, config, { projet: 'extrait-politique', type: 'video', titre: 'Débat retraites', lien: 'https://youtu.be/abc', date: '2026-10-04T22:30:00Z' });
  assert.equal(evenement.jour, '2026-10-05'); // 00 h 30 à Paris
  assert.equal(evenement.lien, 'https://youtu.be/abc');
  assert.equal(ajouterEvenement(j, config, { projet: 'leviaro', titre: 'x', lien: 'javascript:alert(1)' }).evenement.lien, null);
  assert.match(ajouterEvenement(j, config, { projet: 'inconnu', titre: 'x' }).erreur, /Projet inconnu/);
  assert.match(ajouterEvenement(j, config, { projet: 'leviaro', titre: '  ' }).erreur, /titre/);
  assert.equal(ajouterEvenement(j, config, { projet: 'leviaro', titre: 'x', type: 'bizarre' }, { source: 'page' }).evenement.type, 'note');
});

test('automatisations rangées par projet d’après leur nom', () => {
  assert.equal(projetDuWorkflow('Prospection restaurants Lyon', config), 'nour-meet');
  assert.equal(projetDuWorkflow('Vidéo actualité du jour', config), 'extrait-politique');
  assert.equal(projetDuWorkflow('Mail invités Impacteur', config), 'impacteur');
  assert.equal(projetDuWorkflow('Sauvegarde', config), 'autre');
});

test('synchro n8n : compte par jour, ne recompte jamais, pages suivies', async () => {
  const j = vide();
  const maintenant = Date.now();
  const il = (h) => new Date(maintenant - h * 3_600_000).toISOString();
  const pages = {
    '/api/v1/executions?limit=250': { data: [
      { id: '105', workflowId: '1', status: 'running', startedAt: il(0) },
      { id: '104', workflowId: '1', status: 'success', startedAt: il(1) },
      { id: '103', workflowId: '2', status: 'error', startedAt: il(2) },
    ], nextCursor: 'c2' },
    '/api/v1/executions?limit=250&cursor=c2': { data: [{ id: '102', workflowId: '1', status: 'success', startedAt: il(3) }], nextCursor: null },
    '/api/v1/workflows?limit=250': { data: [{ id: '1', name: 'Vidéo actualité' }, { id: '2', name: 'Prospection restaurants' }] },
  };
  const appel = async (chemin) => pages[chemin];
  assert.equal((await synchroniserN8n(j, { appel })).nouvelles, 3);
  assert.equal(j.n8n.dernierId, '104');
  const total = Object.values(j.n8n.jours).flatMap((w) => Object.values(w)).reduce((a, c) => a + c.ok + c.erreur, 0);
  assert.equal(total, 3);
  // Deuxième passage : rien de neuf.
  assert.equal((await synchroniserN8n(j, { appel })).nouvelles, 0);
  assert.equal((await synchroniserN8n(vide(), {})).ignore, true);
});

test('journée, bilan de la semaine et message Telegram du matin', () => {
  const j = vide();
  ajouterEvenement(j, config, { projet: 'extrait-politique', type: 'video', titre: 'Vidéo <1>', date: '2026-10-04T10:00:00Z' });
  ajouterEvenement(j, config, { projet: 'nour-meet', type: 'mail', titre: '12 mails restaurateurs', date: '2026-10-04T09:00:00Z' });
  ajouterEvenement(j, config, { projet: 'nour-meet', type: 'mail', titre: 'Vieux', date: '2026-09-01T09:00:00Z' });
  j.n8n.jours['2026-10-04'] = { 'Prospection restaurants': { ok: 5, erreur: 1 } };
  const jour = journee(j, config, '2026-10-04');
  assert.deepEqual(jour.map((x) => x.projet.id), ['nour-meet', 'extrait-politique']);
  assert.equal(jour[0].automatisations[0].ok, 5);
  const b = bilanSemaine(j, config, '2026-10-05');
  assert.deepEqual(b['nour-meet'], { types: { mail: 1 }, executions: 5, erreurs: 1 });
  const m = messageHier(j, config, '2026-10-05');
  assert.match(m, /Nūr Meet<\/b> : ✉️ 12 mails restaurateurs · ⚙️ 5 exécution\(s\), 1 en erreur/);
  assert.match(m, /Vidéo &lt;1&gt;/);
  assert.equal(messageHier(j, config, '2026-10-20'), null);
});

test('page Journal : jours, liens cliquables, filtre par projet, texte échappé', () => {
  const j = vide();
  ajouterEvenement(j, config, { projet: 'extrait-politique', type: 'video', titre: '<b>Vidéo</b>', lien: 'https://youtu.be/abc', date: '2026-10-05T08:00:00Z' });
  ajouterEvenement(j, config, { projet: 'leviaro', type: 'rdv', titre: 'RDV client', date: '2026-10-04T08:00:00Z' });
  const html = pageJournal(config, j, { jour: '2026-10-05' });
  assert.match(html, /Aujourd'hui/);
  assert.match(html, /Hier/);
  assert.match(html, /href="https:\/\/youtu.be\/abc"/);
  assert.match(html, /&lt;b&gt;Vidéo&lt;\/b&gt;/);
  assert.match(html, /class="actif">Journal/);
  const filtre = pageJournal(config, j, { jour: '2026-10-05', projet: 'leviaro' });
  assert.doesNotMatch(filtre, /youtu\.be/);
  assert.match(filtre, /RDV client/);
});
