import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { synchroniserLeviaro } from '../src/leviaro.js';
import { tableauDeBord } from '../src/business.js';

const configJournal = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../config/journal.json', import.meta.url), 'utf8'));

async function baseExemple() {
  const dossier = await mkdtemp(path.join(tmpdir(), 'lv-test-'));
  const db = new DatabaseSync(path.join(dossier, 'leviaro.db'));
  db.exec(`
    create table companies (id integer primary key, name text, city text, sector text not null default 'autre', state text, created_at text);
    create table messages (id integer primary key, company_id integer, step integer, status text, subject text, sent_at text, created_at text);
    create table replies (id integer primary key, company_id integer, from_email text default 'x@y.fr', subject text, snippet text, category text, received_at text, handled integer);
    create table agency_recs (id integer primary key, status text);
    create table costs (id integer primary key, month text, status text, amount_eur real);
    insert into companies (name, state, created_at) values ('A', 'sequence_active', '2026-10-03 10:00:00'), ('B', 'discussion_active', '2026-09-20 10:00:00'), ('C', 'contact_introuvable', '2026-10-04 23:30:00'), ('D', 'decouverte', '2026-09-25 10:00:00'), ('E', 'decouverte', '2026-10-04 10:00:00');
    insert into messages (step, status, sent_at, created_at) values
      (0, 'envoye', '2026-10-03 09:00:00', '2026-10-03 08:00:00'),
      (0, 'envoye', '2026-10-04 09:00:00', '2026-10-04 08:00:00'),
      (1, 'envoye', '2026-10-04 09:00:00', '2026-10-04 08:00:00'),
      (0, 'attente_validation', null, '2026-10-05 08:00:00'),
      (0, 'erreur_permanente', null, '2026-10-04 08:00:00');
    insert into replies (category, received_at, handled) values ('humaine', '2026-10-04 12:00:00', 0), ('absence', '2026-10-04 12:00:00', 0);
    insert into agency_recs (status) values ('proposee'), ('acceptee');
    insert into costs (month, status, amount_eur) values ('2026-10', 'realise', 1.234), ('2026-10', 'reserve', 5), ('2026-09', 'realise', 9);
  `);
  db.close();
  return dossier;
}

test('synchroniserLeviaro lit une copie de la base et en tire les chiffres', async () => {
  const dossier = await baseExemple();
  const b = { sources: {}, objectifs: {} };
  const r = await synchroniserLeviaro(b, dossier, { maintenant: new Date('2026-10-05T12:00:00Z') });
  assert.equal(r.envois, 3);
  const lv = b.sources.leviaro;
  assert.deepEqual(lv.envois.map((m) => [m.etape, m.jour]), [[0, '2026-10-03'], [0, '2026-10-04'], [1, '2026-10-04']]);
  assert.deepEqual(lv.reponses, [{ jour: '2026-10-04', traitee: false }]);
  assert.deepEqual(lv.entreprises, ['2026-10-03', '2026-09-20', '2026-10-05', '2026-09-25', '2026-10-04']); // 23h30 UTC = lendemain à Paris
  assert.equal(lv.aValider, 1);
  assert.equal(lv.enDiscussion, 1);
  assert.equal(lv.recommandations, 1);
  assert.equal(lv.coutMois, 1.23);
  assert.equal(lv.detail.entreprises[0].nom, 'E');
  assert.equal(lv.aEtudier, 2);
  assert.equal(lv.aEtudierDepuis, '2026-09-25');
  assert.deepEqual(lv.fileEtude, { '2026-10-05': 2 });
  assert.equal(lv.detail.messages.length, 5);
  assert.equal(lv.detail.reponses.length, 2); // humaine + absence : la page montre tout

  const carte = tableauDeBord({ business: b, journal: { evenements: [], n8n: { jours: {} } }, configJournal, jour: '2026-10-05' }).cartes.find((c) => c.id === 'leviaro');
  assert.equal(carte.principal.total, 2);
  assert.equal(carte.chiffres[0].valeur, 1);
  assert.equal(carte.chiffres[1].valeur, 1);
  assert.equal(carte.couleur, 'orange'); // un échec définitif
  assert.ok(carte.aDecider.some((t) => /1 réponse\(s\) de prospect pas encore traitée/.test(t)));
  assert.ok(carte.aDecider.some((t) => /1 recommandation/.test(t)));
});

test('synchroniserLeviaro : pas de base, rien à faire', async () => {
  const dossier = await mkdtemp(path.join(tmpdir(), 'lv-vide-'));
  assert.deepEqual(await synchroniserLeviaro({ sources: {} }, dossier), { ignore: true });
});

test('Leviaro : la file des entreprises à étudier, jour par jour', async () => {
  const dossier = await baseExemple();
  const b = { sources: { leviaro: { fileEtude: { '2026-09-28': 0, '2026-10-04': 1 } } }, objectifs: {} };
  await synchroniserLeviaro(b, dossier, { maintenant: new Date('2026-10-05T12:00:00Z') });
  assert.deepEqual(b.sources.leviaro.fileEtude, { '2026-09-28': 0, '2026-10-04': 1, '2026-10-05': 2 });
  const carte = tableauDeBord({ business: b, journal: { evenements: [], n8n: { jours: {} } }, configJournal, jour: '2026-10-05' }).cartes.find((c) => c.id === 'leviaro');
  const ligne = carte.chiffres.find((x) => x.titre === 'À étudier');
  assert.equal(ligne.valeur, 2);
  assert.match(ligne.detail, /\+2 sur la période \(la file grossit\)/);
  assert.match(ligne.detail, /depuis 10 j/);
  assert.ok(carte.aDecider.some((t) => /2 entreprise\(s\) trouvée\(s\) attendent d'être étudiées/.test(t)));
});

test('Leviaro : file vide, rien à décider', () => {
  const lv = { envois: [], reponses: [], echecs: [], entreprises: [], aValider: 0, enDiscussion: 0, recommandations: 0, coutMois: 0, aEtudier: 0, aEtudierDepuis: null, fileEtude: { '2026-10-05': 0 } };
  const carte = tableauDeBord({ business: { sources: { leviaro: lv }, objectifs: {} }, journal: { evenements: [], n8n: { jours: {} } }, configJournal, jour: '2026-10-05' }).cartes.find((c) => c.id === 'leviaro');
  assert.equal(carte.chiffres.find((x) => x.titre === 'À étudier').detail, 'évolution visible dès demain');
  assert.ok(!carte.aDecider.some((t) => /étudiées/.test(t)));
});

test('Leviaro : bilans de la semaine déposés par l\'agent', async () => {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const dossier = await baseExemple();
  await mkdir(path.join(dossier, 'bilans'));
  await writeFile(path.join(dossier, 'bilans', '2026-09-29.md'), 'Semaine 0');
  await writeFile(path.join(dossier, 'bilans', '2026-10-06.md'), 'BILAN LEVIARO\n- Envois : 0');
  await writeFile(path.join(dossier, 'bilans', 'notes.txt'), 'ignoré');
  const b = { sources: {}, objectifs: {} };
  await synchroniserLeviaro(b, dossier, { maintenant: new Date('2026-10-06T12:00:00Z') });
  assert.deepEqual(b.sources.leviaro.bilans.map((x) => x.jour), ['2026-10-06', '2026-09-29']);
  assert.match(b.sources.leviaro.bilans[0].texte, /Envois : 0/);
});

test('Leviaro : pas de dossier bilans, liste vide', async () => {
  const dossier = await baseExemple();
  const b = { sources: {}, objectifs: {} };
  await synchroniserLeviaro(b, dossier, { maintenant: new Date('2026-10-06T12:00:00Z') });
  assert.deepEqual(b.sources.leviaro.bilans, []);
});

test('Leviaro : diagnostic de l\'agent lu dans data/diagnostic.json', async () => {
  const { writeFile } = await import('node:fs/promises');
  const dossier = await baseExemple();
  await writeFile(path.join(dossier, 'diagnostic.json'), JSON.stringify({ genere_le: '2026-10-06T21:00:00Z', mode: 'simulation', budget: { depense_mois_eur: 33.891, plafond_eur: 70, frais_fixes_eur: 17 }, erreurs_24h: [{ x: 1 }, { x: 2 }] }));
  const b = { sources: {}, objectifs: {} };
  await synchroniserLeviaro(b, dossier, { maintenant: new Date('2026-10-06T21:10:00Z') });
  assert.deepEqual(b.sources.leviaro.diagnostic, { genere: '2026-10-06T21:00:00Z', mode: 'simulation', depense: 33.89, plafond: 70, erreurs24h: 2 });
  const carte = tableauDeBord({ business: b, journal: { evenements: [], n8n: { jours: {} } }, configJournal, jour: '2026-10-06' }).cartes.find((c) => c.id === 'leviaro');
  const budget = carte.chiffres.find((x) => x.titre === 'Budget IA du mois');
  assert.equal(budget.valeur, '33,89 €');
  assert.equal(budget.detail, 'sur 70 € · mode simulation');
  assert.ok(carte.aDecider.some((t) => /2 erreur\(s\) de l'agent/.test(t)));
});

test('Leviaro : pas de diagnostic, rien d\'affiché', async () => {
  const dossier = await baseExemple();
  const b = { sources: {}, objectifs: {} };
  await synchroniserLeviaro(b, dossier, { maintenant: new Date('2026-10-06T21:10:00Z') });
  assert.equal(b.sources.leviaro.diagnostic, null);
  const carte = tableauDeBord({ business: b, journal: { evenements: [], n8n: { jours: {} } }, configJournal, jour: '2026-10-06' }).cartes.find((c) => c.id === 'leviaro');
  assert.ok(!carte.chiffres.some((x) => x.titre === 'Budget IA du mois'));
});

test('Leviaro : catalogue par métier lu dans data/catalogue.json et affiché', async () => {
  const { writeFile } = await import('node:fs/promises');
  const { pageProjet } = await import('../src/page-projet.js');
  const dossier = await baseExemple();
  await writeFile(path.join(dossier, 'catalogue.json'), JSON.stringify({
    maj: '2026-10-07',
    metiers: { coachs: { nom: 'Coachs', elements: [
      { type: 'service', priorite: 'P1', statut: 'prêt', offre: '890 € + 39 €/mois', texte: 'Vos appels découverte', plan: ['Questionnaire trié', 'Rappels Calendly'] },
      { type: 'aide', texte: 'France Num', lien: 'https://www.francenum.gouv.fr' },
      { type: 'aide', texte: 'Lien douteux', lien: 'javascript:alert(1)' },
      { type: 'auto' },
    ] } },
    ecartees: ['FNE-Formation'],
  }));
  const b = { sources: {}, objectifs: {} };
  await synchroniserLeviaro(b, dossier, { maintenant: new Date('2026-10-07T12:00:00Z') });
  const cat = b.sources.leviaro.catalogue;
  assert.equal(cat.metiers[0].id, 'coachs');
  assert.equal(cat.metiers[0].elements.length, 3);
  assert.equal(cat.metiers[0].elements[2].lien, null);
  assert.deepEqual(cat.ecartees, ['FNE-Formation']);
  const html = pageProjet(configJournal, 'leviaro', { business: b, journal: { evenements: [], n8n: { jours: {} } }, idees: { idees: [] }, jour: '2026-10-07' });
  assert.match(html, /Ce que Leviaro peut proposer, par métier/);
  assert.match(html, /Vos appels découverte/);
  assert.match(html, /Questionnaire trié › Rappels Calendly/);
  assert.match(html, /FNE-Formation/);
});

test('Leviaro : pas de catalogue, null', async () => {
  const dossier = await baseExemple();
  const b = { sources: {}, objectifs: {} };
  await synchroniserLeviaro(b, dossier, { maintenant: new Date('2026-10-07T12:00:00Z') });
  assert.equal(b.sources.leviaro.catalogue, null);
});
