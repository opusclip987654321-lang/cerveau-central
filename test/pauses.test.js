import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pauserProjet, reprendreProjet, alertesCoupees } from '../src/pauses.js';
import { repondre, ajouterEchange } from '../src/discussion.js';
import { contexteCerveau } from '../src/contexte.js';

const configJournal = JSON.parse(await readFile(new URL('../config/journal.json', import.meta.url), 'utf8'));

function faux(workflows) {
  const appels = [];
  const appel = async (chemin, methode = 'GET') => {
    appels.push(`${methode} ${chemin}`);
    if (chemin.startsWith('/api/v1/workflows?')) return { data: workflows };
    const m = /workflows\/(\w+)\/(activate|deactivate)/.exec(chemin);
    const w = workflows.find((x) => x.id === m[1]);
    if (w.casse) throw new Error('n8n répond 500');
    w.active = m[2] === 'activate';
    return w;
  };
  return { appel, appels };
}

test('pause : arrête seulement les automatisations actives du projet, reprise à l’identique', async () => {
  const wfs = [
    { id: '1', name: 'Nour Meet 1 - Recherche', active: true },
    { id: '2', name: 'Nour Meet 3 - Relances à valider', active: false },
    { id: '3', name: 'IMPACTEUR C - ENVOIS', active: true },
  ];
  const actu = [{ id: '9', name: 'ZAPPING 1', active: true }];
  const a = faux(wfs);
  const b = faux(actu);
  const instances = { principal: { url: 'x', cle: 'k' }, actualite: { url: 'y', cle: 'k' } };
  const pauses = { projets: {} };
  const r = await pauserProjet(pauses, 'nour-meet', { instances, configJournal, appels: { principal: a.appel, actualite: b.appel } });
  assert.deepEqual(r.coupes.map((w) => w.id), ['1']);
  assert.deepEqual(wfs.map((w) => w.active), [false, false, true]);
  assert.equal(actu[0].active, true);
  assert.deepEqual([...alertesCoupees(pauses)], ['nour-meet']);
  assert.equal((await pauserProjet(pauses, 'nour-meet', { instances, configJournal })).deja, true);

  await reprendreProjet(pauses, 'nour-meet', { instances, appels: { principal: a.appel } });
  assert.deepEqual(wfs.map((w) => w.active), [true, false, true]); // la 2 était déjà arrêtée : elle le reste
  assert.deepEqual(pauses.projets, {});

  // L'extrait politique : ses automatisations sont sur le 2e n8n.
  await pauserProjet(pauses, 'extrait-politique', { instances, configJournal, appels: { principal: a.appel, actualite: b.appel } });
  assert.equal(actu[0].active, false);
  assert.deepEqual([...alertesCoupees(pauses)], ['vps-youtube']);
});

test('reprise ratée : le projet reste en pause avec ce qui n’a pas redémarré', async () => {
  const wfs = [{ id: '1', name: 'Nour Meet 1', active: true }, { id: '2', name: 'Nour Meet 6', active: true }];
  const a = faux(wfs);
  const instances = { principal: { url: 'x', cle: 'k' } };
  const pauses = { projets: {} };
  await pauserProjet(pauses, 'nour-meet', { instances, configJournal, appels: { principal: a.appel } });
  wfs[1].casse = true;
  const r = await reprendreProjet(pauses, 'nour-meet', { instances, appels: { principal: a.appel } });
  assert.equal(r.relances.length, 1);
  assert.equal(r.erreurs.length, 1);
  assert.deepEqual(pauses.projets['nour-meet'].workflows.map((w) => w.id), ['2']);
});

test('discussion : contexte transmis, alternance respectée, coût compté', async () => {
  let recu;
  const client = { beta: { messages: { create: async (req) => ((recu = req), { content: [{ type: 'text', text: 'Claude te coûte le plus : 100 €.' }], usage: { input_tokens: 1000, output_tokens: 100 } }) } } };
  const donnees = { messages: [] };
  ajouterEchange(donnees, 'question sans réponse', { erreur: 'plafond' });
  const historique = donnees.messages.filter((m) => !m.erreur);
  const r = await repondre(historique, 'Qu’est-ce qui coûte le plus ?', { client, contexte: 'Claude 100 € par mois' });
  assert.equal(r.texte, 'Claude te coûte le plus : 100 €.');
  assert.ok(r.cout > 0);
  assert.match(recu.system, /Claude 100 € par mois/);
  assert.deepEqual(recu.messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.equal((await repondre([], 'x', { client: null, contexte: '' })).erreur.includes('clé'), true);
});

test('contexte : argent, journal, serveurs et pauses en texte', () => {
  const texte = contexteCerveau({
    etat: { verifications: { a: { projet: 'nour-meet', nom: 'Site', etat: 'ok', detail: '200' } } },
    argent: { lignes: [{ id: 'l', libelle: 'VPS', projet: 'commun', montant: 14, devise: '€', frequence: 'mois', date: null }] },
    journal: { evenements: [{ jour: '2026-10-04', projet: 'nour-meet', type: 'mail', titre: '12 restaurants contactés' }], n8n: { jours: {} } },
    serveurs: { serveurs: {} },
    configServeurs: { serveurs: [{ id: 'vps-nour', nom: 'VPS Nūr', prix: '14 €/mois', role: 'x' }], motifs: [] },
    configJournal,
    pauses: { projets: { leviaro: { depuis: '2026-10-05T10:00:00Z', workflows: [] } } },
    jour: '2026-10-05',
  });
  assert.match(texte, /VPS \(commun\) : 14 € par mois/);
  assert.match(texte, /12 restaurants contactés/);
  assert.match(texte, /Leviaro \(depuis 2026-10-05\)/);
  assert.match(texte, /VPS Nūr \(14 €\/mois\) : pas de relevé/);
});
