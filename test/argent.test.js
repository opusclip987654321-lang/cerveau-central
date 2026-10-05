import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bilan, lireLigne, prochaineEcheance, rappelsARenvoyer, totalLisible, chargerArgent } from '../src/argent.js';
import { deposerFacture, lireFacture, appliquerLecture, rapprochement, supprimerFacture } from '../src/factures.js';
import { pageArgent } from '../src/page-argent.js';

const projets = [{ id: 'commun', nom: 'Commun' }, { id: 'nour-meet', nom: 'Nūr Meet' }];
const lignes = () => [
  { id: 'vps', libelle: 'VPS', projet: 'commun', montant: 14, devise: '€', frequence: 'mois', date: null },
  { id: 'dom', libelle: 'Domaine', projet: 'nour-meet', montant: 12, devise: '€', frequence: 'an', date: '2026-10-07' },
  { id: 'twi', libelle: 'Twilio', projet: 'nour-meet', montant: 20, devise: '€', frequence: 'une-fois', date: '2026-09-22' },
  { id: 'ipr', libelle: 'IPRoyal', projet: 'commun', montant: 50, devise: '$', frequence: 'une-fois', date: '2026-10-04' },
];

test('bilan : fixe lissé, mois en cours, 30 derniers jours, par projet', () => {
  const b = bilan(lignes(), '2026-10-05');
  assert.deepEqual(b.fixe, { '€': 15 });
  assert.deepEqual(b.ceMois, { '€': 15, $: 50 });
  assert.deepEqual(b.trenteJours, { '€': 20, $: 50 });
  assert.deepEqual(b.projets['nour-meet'].ceMois, { '€': 1 });
  assert.equal(totalLisible(b.ceMois), '15 € + 50 $');
});

test('lecture du formulaire : montant à virgule, erreurs claires', () => {
  const ok = lireLigne({ libelle: ' Recharge ', montant: '12,5', devise: '€', frequence: 'une-fois', date: '2026-10-05', projet: 'commun' }, projets);
  assert.equal(ok.ligne.montant, 12.5);
  assert.equal(ok.ligne.libelle, 'Recharge');
  assert.match(lireLigne({ libelle: 'x', montant: '-3', devise: '€', frequence: 'mois', projet: 'commun' }, projets).erreur, /positif/);
  assert.match(lireLigne({ libelle: 'x', montant: '3', devise: '€', frequence: 'une-fois', projet: 'commun' }, projets).erreur, /date/);
  assert.match(lireLigne({ libelle: 'x', montant: '3', devise: '£', frequence: 'mois', projet: 'commun' }, projets).erreur, /Devise/);
});

test('échéances : mois suivant, fin de mois, une seule alerte par échéance', () => {
  assert.equal(prochaineEcheance({ frequence: 'mois', date: '2026-01-31' }, '2026-02-10'), '2026-02-28');
  assert.equal(prochaineEcheance({ frequence: 'an', date: '2025-10-07' }, '2026-10-05'), '2026-10-07');
  assert.equal(prochaineEcheance({ frequence: 'mois', date: null }, '2026-10-05'), null);
  const donnees = { lignes: lignes(), rappels: {} };
  assert.deepEqual(rappelsARenvoyer(donnees, { jour: '2026-10-05' }).map((r) => r.id), ['dom']);
  assert.equal(rappelsARenvoyer(donnees, { jour: '2026-10-06' }).length, 0);
});

test('premier démarrage : part du récap de config', async () => {
  const dossier = await mkdtemp(path.join(tmpdir(), 'argent-'));
  const d = await chargerArgent(path.join(dossier, 'absent.json'), new URL('../config/argent.json', import.meta.url).pathname);
  assert.ok(d.lignes.length >= 10);
  assert.ok(d.lignes.every((l) => l.id && l.montant > 0));
});

function faux(reponse) {
  const appels = [];
  return { appels, beta: { messages: { create: async (p) => (appels.push(p), reponse) } } };
}

test('factures : dépôt, lecture par Claude, rapprochement et plafond', async () => {
  const dossier = await mkdtemp(path.join(tmpdir(), 'factures-'));
  const donnees = { lignes: lignes(), factures: [] };
  assert.match((await deposerFacture(donnees, dossier, { nom: 'a.txt', type: 'text/plain', base64: 'eA==' })).erreur, /Format/);
  const { facture } = await deposerFacture(donnees, dossier, { nom: 'ovh.pdf', type: 'application/pdf', base64: Buffer.from('%PDF').toString('base64') });

  const client = faux({
    stop_reason: 'end_turn',
    usage: { input_tokens: 2000, output_tokens: 100 },
    content: [{ type: 'text', text: JSON.stringify({ estUneFacture: true, fournisseur: 'OVH', montant: 16.8, devise: '€', date: '2026-10-01', periode: 'octobre', ligne: 'vps' }) }],
  });
  const resultat = await lireFacture(donnees, dossier, facture, { client });
  assert.equal(client.appels[0].model, 'claude-sonnet-5-5');
  assert.equal(client.appels[0].messages[0].content[0].type, 'document');
  appliquerLecture(donnees, facture.id, resultat, '2026-10-05');
  assert.equal(donnees.ia['2026-10'], 0.005);

  const r = rapprochement(donnees, '2026-10-05');
  const vps = r.lignes.find((x) => x.ligne.id === 'vps');
  assert.equal(vps.aJour, true);
  assert.equal(vps.ecart, true); // 16,80 € facturés pour 14 € prévus
  assert.equal(r.lignes.find((x) => x.ligne.id === 'twi').aJour, false);

  // Ligne inconnue renvoyée par Claude : traitée comme « aucune ligne ».
  const { facture: f2 } = await deposerFacture(donnees, dossier, { nom: 'x.png', type: 'image/png', base64: 'eA==' });
  const client2 = faux({ stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: JSON.stringify({ estUneFacture: true, fournisseur: 'Canva', montant: 12, devise: '€', date: '2026-10-02', periode: '', ligne: 'inventee' }) }] });
  appliquerLecture(donnees, f2.id, await lireFacture(donnees, dossier, f2, { client: client2 }));
  assert.equal(client2.appels[0].messages[0].content[0].type, 'image');
  assert.equal(rapprochement(donnees, '2026-10-05').orphelines.length, 1);

  // Plafond atteint : Claude n'est pas appelé.
  donnees.ia['2026-10'] = 10;
  const client3 = faux({});
  const bloque = await lireFacture(donnees, dossier, facture, { client: client3, plafondDollars: 10 });
  assert.match(bloque.erreur, /Plafond/);
  assert.equal(client3.appels.length, 0);

  assert.equal(await supprimerFacture(donnees, dossier, f2.id), true);
  assert.equal(donnees.factures.length, 1);
});

test('lecture : erreur de l’API gardée comme message, pas de plantage', async () => {
  const dossier = await mkdtemp(path.join(tmpdir(), 'factures-'));
  const donnees = { lignes: lignes(), factures: [] };
  const { facture } = await deposerFacture(donnees, dossier, { nom: 'a.pdf', type: 'application/pdf', base64: 'eA==' });
  const client = { beta: { messages: { create: async () => { throw new Error('clé invalide'); } } } };
  assert.match((await lireFacture(donnees, dossier, facture, { client })).erreur, /clé invalide/);
  assert.deepEqual(await lireFacture(donnees, dossier, facture, { client: null }), { lecture: null, erreur: null, cout: 0 });
});

test('page Argent : tuiles, liste, facture orpheline proposée à l’ajout, texte échappé', () => {
  const donnees = {
    lignes: [...lignes(), { id: 'z', libelle: '<script>', projet: 'commun', montant: 1, devise: '€', frequence: 'mois', date: null }],
    factures: [{ id: 'f1', nom: 'canva.pdf', type: 'application/pdf', lecture: { estUneFacture: true, fournisseur: 'Canva', montant: 12, devise: '€', date: '2026-10-02', periode: '', ligne: '' } }],
  };
  const html = pageArgent({ projets }, donnees, { jour: '2026-10-05' });
  assert.match(html, /Ce mois-ci/);
  assert.match(html, /16 € \+ 50 \$/);
  assert.match(html, /ne correspond à aucune ligne/);
  assert.match(html, /name="facture" value="f1"/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<td><script>/);
  assert.match(html, /class="actif">Argent/);
});
