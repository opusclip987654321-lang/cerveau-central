import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collecterDecisions, fusionnerDecisions, envoyerNotion, htmlDecisions, typeDe, pageNotion } from '../src/decisions.js';

const loopNour = {
  historique: [
    { version: 1, quand: '2026-09-26T09:00:00Z', par: 'départ', changements: ['Départ'], pourquoi: '' },
    { version: 2, quand: '2026-10-19T18:00:00Z', par: 'Claude (fil de la loop)', changements: ['Premier mail réécrit.'], pourquoi: '3 intéressés sur 595.' },
    { version: 3, quand: '2026-11-02T09:05:00Z', par: 'la loop (revue du lundi)', changements: ['Objet plus court.'], pourquoi: 'Ouvertures 12 %.' },
    { version: 4, quand: '2026-11-03T10:00:00Z', par: 'louis (annulation)', changements: ['Retour à la v2.'], pourquoi: 'Annulé par louis.' },
  ],
  revues: [
    { semaine: '2026-11-09', quand: '2026-11-09T09:05:00Z', changer: false, changements: [], pourquoi: 'Trop peu de réponses pour juger la v4.', question: null, erreur: null },
    { semaine: '2026-11-02', quand: '2026-11-02T09:05:00Z', changer: true, version: 3, changements: ['Objet plus court.'], pourquoi: 'Ouvertures 12 %.', question: null, erreur: null },
    { semaine: '2026-10-26', quand: '2026-10-26T09:05:00Z', changer: false, changements: [], pourquoi: '', question: null, erreur: 'Plafond du mois atteint' },
  ],
  lecons: [{ semaine: '2026-11-02', texte: 'Relance à J+3 : 0 réponse sur 40, arrêtée.' }],
};
const business = {
  sources: {
    vegebudget: { loop: { journal: [{ version: 2, date: '2026-10-26', changements: ['Accueil réécrit'], pourquoi: '34 visites sur 42 partent en 15 s.', mesure: 'rebond' }, { version: 2, date: '2026-11-02', changements: [], pourquoi: 'Rebond en baisse, on attend.' }] } },
    nourPublic: { lecons: ['Les carrousels texte font 3 fois moins de portée.'], decisions: [{ date: '2026-10-21', type: 'arrêté', quoi: 'Carrousels texte arrêtés', pourquoi: 'Portée /3' }] },
  },
};
const loopHistoires = { decisions: [{ date: '2026-10-19', quoi: 'Cycle 1 : choix B', pourquoi: 'Shorts 3 495 vues' }] };

test('collecte : changé, gardé, leçon, geste de louis ; ni départ, ni revue en erreur, ni doublon de la revue', () => {
  const d = collecterDecisions({ loopNour, business, loopHistoires });
  const resto = d.filter((x) => x.loop === 'nm-resto');
  assert.deepEqual(resto.map((x) => x.type).sort(), ['Changé', 'Changé', 'Gardé', 'Geste de louis', 'Leçon']);
  const garde = resto.find((x) => x.type === 'Gardé');
  assert.equal(garde.date, '2026-11-09');
  assert.match(garde.quoi, /v4 gardée/);
  assert.equal(garde.pourquoi, 'Trop peu de réponses pour juger la v4.');
  assert.ok(!resto.some((x) => /Départ/.test(x.quoi)));
  assert.equal(d.filter((x) => x.loop === 'vege').map((x) => x.type).join(), 'Changé,Gardé');
  assert.equal(d.find((x) => x.cle.startsWith('nm-public:lecon:')).date, null);
  assert.equal(d.find((x) => x.loop === 'nm-public' && x.date === '2026-10-21').type, 'Leçon');
  assert.equal(d.find((x) => x.loop === 'phv').type, 'Changé');
  assert.equal(new Set(d.map((x) => x.cle)).size, d.length);
});

test('types venus d’ailleurs', () => {
  assert.equal(typeDe('gardé'), 'Gardé');
  assert.equal(typeDe('Arrêté'), 'Leçon');
  assert.equal(typeDe('question'), 'Question à louis');
  assert.equal(typeDe(undefined), 'Changé');
});

test('fusion : rien n’est réécrit ni effacé, date du jour pour une leçon sans date', () => {
  const archive = { decisions: [] };
  const maintenant = new Date('2026-11-10T08:00:00Z');
  const d = collecterDecisions({ loopNour, business, loopHistoires });
  assert.equal(fusionnerDecisions(archive, d, maintenant).length, d.length);
  assert.equal(fusionnerDecisions(archive, d, maintenant).length, 0);
  // La loop a oublié ses vieilles lignes : l'historique les garde.
  fusionnerDecisions(archive, [], maintenant);
  assert.equal(archive.decisions.length, d.length);
  assert.equal(archive.decisions.find((x) => x.cle.startsWith('nm-public:lecon:')).date, '2026-11-10');
  assert.ok(archive.decisions.every((x, i, l) => i === 0 || l[i - 1].date <= x.date));
});

test('Notion : sans clé rien ne part ; avec clé, les clés déjà présentes ne sont pas recréées', async () => {
  const archive = { decisions: [] };
  fusionnerDecisions(archive, collecterDecisions({ loopHistoires, business: {} }), new Date('2026-10-20T20:00:00Z'));
  fusionnerDecisions(archive, [{ cle: 'phv:autre', loop: 'phv', date: '2026-10-20', type: 'Gardé', quoi: 'Rythme gardé', pourquoi: '' }]);
  assert.deepEqual(await envoyerNotion(archive, {}), { envoyees: 0, attente: 2 });
  const appels = [];
  const faux = async (url, { body }) => {
    appels.push({ url, corps: JSON.parse(body) });
    if (url.endsWith('/query')) return { ok: true, json: async () => ({ results: [{ properties: { Clé: { rich_text: [{ plain_text: 'phv:autre' }] } } }], has_more: false }) };
    return { ok: true, json: async () => ({}) };
  };
  const r = await envoyerNotion(archive, { jeton: 'x', fetch: faux });
  assert.deepEqual(r, { envoyees: 1, attente: 0 });
  const page = appels.find((a) => a.url.endsWith('/pages')).corps;
  assert.equal(page.properties.Loop.select.name, 'Petites histoires vraies');
  assert.equal(page.properties.Date.date.start, '2026-10-19');
  assert.deepEqual(await envoyerNotion(archive, { jeton: 'x', fetch: faux }), { envoyees: 0, attente: 0 });
});

test('Notion : une erreur laisse les lignes en attente', async () => {
  const archive = { decisions: [] };
  fusionnerDecisions(archive, collecterDecisions({ loopHistoires }));
  await assert.rejects(envoyerNotion(archive, { jeton: 'x', fetch: async () => ({ ok: false, status: 401, text: async () => 'unauthorized' }) }), /401/);
  assert.equal(archive.decisions[0].notion, false);
});

test('page projet : décisions du projet seulement, échappées', () => {
  const archive = { decisions: [] };
  fusionnerDecisions(archive, [...collecterDecisions({ loopNour, business, loopHistoires }), { cle: 'phv:x', loop: 'phv', date: '2026-10-20', type: 'Changé', quoi: '<b>', pourquoi: '' }]);
  const h = htmlDecisions(archive, 'nour-meet');
  assert.match(h, /Historique des décisions/);
  assert.match(h, /Nūr Meet grand public/);
  assert.doesNotMatch(h, /Cycle 1/);
  assert.match(htmlDecisions(archive, 'histoires-vraies'), /&lt;b&gt;/);
  assert.equal(htmlDecisions(archive, 'leviaro'), '');
  assert.equal(pageNotion({ cle: 'a', loop: 'vege', date: '2026-10-20', type: 'Bizarre', quoi: 'x' }).properties.Type.select.name, 'Changé');
});
