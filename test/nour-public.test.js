import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { lireNourPublic, enregistrerNourPublic, etatReseaux, alertesNourPublic, htmlNourPublic } from '../src/nour-public.js';
import { tableauDeBord } from '../src/business.js';
import { pageProjet } from '../src/page-projet.js';

const configJournal = JSON.parse(await readFile(new URL('../config/journal.json', import.meta.url), 'utf8'));
// Sortie réelle du SQL de scripts/nour-public-releve.sh, sur une base de test (chiffres en texte compris).
const exemple = JSON.parse(await readFile(new URL('./exemples/nour-public.json', import.meta.url), 'utf8'));
const maintenant = new Date('2026-10-19T17:00:00Z');

test('lireNourPublic : garde ce qui est attendu, convertit les nombres reçus en texte', () => {
  const np = lireNourPublic({ ...exemple, inconnu: 'x', posts: [...exemple.posts, { jour: 'pas une date' }] }, maintenant);
  assert.equal(np.comptesTotal, 2);
  assert.equal(np.posts.length, 2);
  assert.equal(np.posts[0].portee, 3);
  assert.equal(np.posts[1].instaErreur, 'Instagram (403) : limit');
  assert.equal(np.inconnu, undefined);
  assert.throws(() => lireNourPublic(null));
});

test('etatReseaux et alertes : réseau muet, erreur citée, aucune soirée à vendre', () => {
  const np = lireNourPublic(exemple, maintenant);
  const r = etatReseaux(np);
  assert.deepEqual(r.instagram, { dernierPost: '2026-10-18', erreur: 'Instagram (403) : limit' });
  assert.deepEqual(r.facebook, { dernierPost: null, erreur: 'Facebook (400) : token' });
  // Instagram n'a manqué qu'un jour : pas encore d'alerte.
  const a = alertesNourPublic(np, maintenant);
  assert.ok(a.some((x) => x.startsWith('Facebook : aucun post')));
  assert.ok(!a.some((x) => x.startsWith('Instagram')));
  assert.ok(a.some((x) => x.includes('Aucune vraie soirée')));
  const plusTard = alertesNourPublic(np, new Date('2026-10-20T17:00:00Z'));
  assert.ok(plusTard.some((x) => x.startsWith('Instagram ne publie plus depuis 2 jours')));
  assert.ok(plusTard.some((x) => x.includes('relevé grand public')) === false);
  assert.ok(alertesNourPublic(np, new Date('2026-10-21T00:00:00Z')).some((x) => x.includes('relevé grand public')));
});

test('une vraie soirée efface l’alerte « rien à vendre » ; une soirée de démo ne compte pas', () => {
  const demo = lireNourPublic({ ...exemple, soirees: [{ titre: 'Démo', demo: true }] }, maintenant);
  assert.ok(alertesNourPublic(demo, maintenant).some((x) => x.includes('Aucune vraie soirée')));
  const vraie = lireNourPublic({ ...exemple, soirees: [{ titre: 'Dîner au Casanova', lieu: 'Vitry', quand: '13/11 20:00', places: 24, inscrits: 3, minimum: 12 }] }, maintenant);
  assert.ok(!alertesNourPublic(vraie, maintenant).some((x) => x.includes('Aucune vraie soirée')));
  const html = htmlNourPublic(vraie, maintenant);
  assert.match(html, /Dîner au Casanova/);
  assert.match(html, /3 \/ 24/);
});

test('tunnel : chaque étape avec sa part de la précédente ; alerte si le site semble incompris', () => {
  const np = lireNourPublic(exemple, maintenant);
  assert.deepEqual(np.tunnel, { visiteurs: 3, explorent: 2, soirees: 1 });
  const html = htmlNourPublic(np, maintenant);
  assert.match(html, /1\. Visiteurs<\/span><span class="num">3<\/span>/);
  assert.match(html, /Vont au-delà de la 1re page<\/span><span class="num">2 <small>\(67 %\)<\/small>/);
  // Trop peu de visiteurs pour juger : pas d'alerte.
  assert.ok(!alertesNourPublic(np, maintenant).some((x) => x.includes('le site est-il compris')));
  const fuite = lireNourPublic({ ...exemple, tunnel: { visiteurs: 200, explorent: 20, soirees: 5 } }, maintenant);
  assert.ok(alertesNourPublic(fuite, maintenant).some((x) => x.startsWith('Seuls 10 % des visiteurs')));
  // Relevé ancien sans tunnel : « indisponible », jamais 0.
  assert.match(htmlNourPublic(lireNourPublic({ ...exemple, tunnel: undefined }, maintenant), maintenant), /1\. Visiteurs<\/span><span class="num">indisponible/);
});

test('carnet de leçons de la loop : affiché du plus récent au plus ancien', () => {
  const np = lireNourPublic({ ...exemple, lecons: ['2026-10-19 · carrousels · portée 2 · arrêté', '', '2026-10-26 · vidéo courte · portée 40 · gardé'] }, maintenant);
  assert.equal(np.lecons.length, 2);
  assert.match(htmlNourPublic(np, maintenant), /Ce que la loop a appris<\/h4><ul><li>2026-10-26/);
  assert.doesNotMatch(htmlNourPublic(lireNourPublic(exemple, maintenant), maintenant), /Ce que la loop a appris/);
});

test('bloc grand public : chiffres absents = « indisponible », jamais 0', () => {
  const np = lireNourPublic({ ...exemple, comptesTotal: null }, maintenant);
  const html = htmlNourPublic(np, maintenant);
  assert.match(html, /<b>indisponible<\/b><span>comptes en tout/);
  assert.match(html, /🔴 Facebook : dernier post jamais/);
  assert.equal(htmlNourPublic(null), '');
});

test('les alertes arrivent sur la carte Nūr Meet et le bloc sur sa page', () => {
  const business = { sources: { prospection: { prospects: [], envois: [], ouvertures: [], maj: null } }, objectifs: {} };
  enregistrerNourPublic(business, lireNourPublic(exemple, new Date()));
  const journal = { evenements: [], n8n: { jours: {}, instances: {} } };
  const t = tableauDeBord({ business, journal, configJournal });
  const carte = t.cartes.find((c) => c.id === 'nour-meet');
  assert.ok(carte.aDecider.some((x) => x.includes('Aucune vraie soirée')));
  const page = pageProjet(configJournal, 'nour-meet', { business, journal, idees: { idees: [] }, pauses: { projets: {} } });
  assert.match(page, /Grand public/);
  assert.doesNotMatch(pageProjet(configJournal, 'leviaro', { business, journal, idees: { idees: [] }, pauses: { projets: {} } }), /Grand public <small>/);
});
