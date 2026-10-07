import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { synchroniserVegebudget, datesDe } from '../src/vegebudget.js';
import { tableauDeBord } from '../src/business.js';
import { pageProjet } from '../src/page-projet.js';

const configJournal = JSON.parse(await readFile(new URL('../config/journal.json', import.meta.url), 'utf8'));
const journalVide = () => ({ evenements: [], n8n: { jours: {}, instances: {} } });

// Réponse de GET https://vegebudget.fr/api/stats.
const stats = () => ({
  maj: '2026-10-07T17:00:00Z',
  jours: [
    { jour: '2026-10-06', visiteurs: 10, semaines: 4, offreVue: 2, connexionsDemandees: 3, inscrits: 2, clicsPayer: 1, reservations: 1 },
    { jour: '2026-10-07', visiteurs: 40, semaines: 2, offreVue: 1, connexionsDemandees: 1, inscrits: 4, clicsPayer: 0, reservations: 0 },
    { jour: 'pas une date', visiteurs: 99 },
  ],
  sources: [{ source: 'google.com', n: 25 }, { source: 'direct', n: 15 }],
  totaux: { membres: 6, abonnes: 0, reservationsFondateur: 1, reservationsPremium: 0 },
});

test('synchroniserVegebudget garde les jours valides et les totaux', async () => {
  const b = { sources: {} };
  const r = await synchroniserVegebudget(b, { appel: async () => stats(), maintenant: new Date('2026-10-07T17:05:00Z') });
  assert.deepEqual(r, { jours: 2 });
  assert.equal(b.sources.vegebudget.jours[1].connexions, 1);
  assert.equal(b.sources.vegebudget.totaux.membres, 6);
  assert.deepEqual(datesDe(b.sources.vegebudget, 'inscrits'), ['2026-10-06', '2026-10-06', '2026-10-07', '2026-10-07', '2026-10-07', '2026-10-07']);
  assert.deepEqual(await synchroniserVegebudget({ sources: {} }, {}), { ignore: true });
  await assert.rejects(synchroniserVegebudget({ sources: {} }, { appel: async () => ({ error: 'Accès refusé.' }) }), /illisible/);
});

test('carte et page VégéBudget montrent l’entonnoir', async () => {
  const b = { sources: {}, objectifs: {} };
  await synchroniserVegebudget(b, { appel: async () => stats() });
  const c = tableauDeBord({ business: b, journal: journalVide(), configJournal, jour: '2026-10-07' }).cartes.find((x) => x.id === 'vegebudget');
  assert.equal(c.principal.total, 50);
  assert.deepEqual(c.chiffres.map((x) => [x.titre, x.valeur]), [['Semaines composées', 6], ['Inscrits', 6], ['Clics sur payer', 1]]);
  assert.match(c.chiffres[0].detail, /12 %/);
  assert.match(c.aDecider.join(' '), /composent une semaine/);
  assert.equal(c.secondaire.titre, 'Inscrits');

  const html = pageProjet(configJournal, 'vegebudget', { business: b, journal: journalVide(), idees: { idees: [] }, jour: '2026-10-07' });
  assert.match(html, /Le parcours sur 30 jours/);
  assert.match(html, /Ont cliqué sur payer/);
  assert.match(html, /google\.com/);
  assert.match(html, /6 membre\(s\)/);

  const vide = pageProjet(configJournal, 'vegebudget', { business: { sources: {}, objectifs: {} }, journal: journalVide(), idees: { idees: [] }, jour: '2026-10-07' });
  assert.match(vide, /VEGEBUDGET_STATS_JETON/);
  const c2 = tableauDeBord({ business: { sources: {}, objectifs: {} }, journal: journalVide(), configJournal, jour: '2026-10-07' }).cartes.find((x) => x.id === 'vegebudget');
  assert.equal(c2.couleur, 'gris');
});
