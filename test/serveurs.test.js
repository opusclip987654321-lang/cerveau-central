import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { octets, lireReleve, enregistrerReleve, analyser, parProjet, croissanceParJour, conseilsEntreServeurs, sauverServeurs } from '../src/serveurs.js';
import { verifierReleve } from '../src/checks/releve.js';
import { pageServeurs } from '../src/page-serveurs.js';

const config = JSON.parse(await readFile(new URL('../config/serveurs.json', import.meta.url), 'utf8'));
const texte = await readFile(new URL('./exemples/releve.txt', import.meta.url), 'utf8');
const seuils = { disqueAttention: 85, disqueCritique: 95 };

test('tailles Docker lues en octets', () => {
  assert.equal(octets('1.2GB'), 1_200_000_000);
  assert.equal(octets('38.5MiB'), Math.round(38.5 * 1024 ** 2));
  assert.equal(octets('0B'), 0);
  assert.equal(octets('12kB'), 12_000);
  assert.equal(octets('n/a'), 0);
});

test('relevé : disques, mémoire, conteneurs, place Docker, dossiers', () => {
  const r = lireReleve(texte);
  assert.equal(r.hote, 'vps-59f9b67f');
  assert.equal(r.coeurs, 2);
  assert.equal(r.charge, 0.51);
  assert.equal(r.disques[0].point, '/');
  assert.equal(r.memoire.total, 3913232 * 1024);
  assert.equal(r.conteneurs.length, 6);
  const n8n = r.conteneurs.find((c) => c.nom === 'n8n-n8n-1');
  assert.equal(n8n.taille, 2_100_000_000);
  assert.equal(n8n.compose, 'n8n');
  assert.equal(n8n.cpu, 4.2);
  assert.equal(r.conteneurs.find((c) => c.nom === 'leviaro-site').enMarche, false);
  assert.equal(r.docker.images.recuperable, 2_400_000_000);
  assert.equal(r.volumes.length, 3);
  assert.equal(r.dossiers[0].chemin, '/opt/nour-video-agent');
});

test('par projet : conteneurs, volumes de leur compose et dossiers rangés au bon endroit', () => {
  const p = parProjet(lireReleve(texte), config);
  assert.equal(p['Caddy (adresses web)'].conteneurs.length, 1);
  assert.equal(p['Nūr Meet'].conteneurs.length, 2);
  assert.equal(p['n8n (automatisations)'].disque, 2_100_000_000 + 1_300_000_000);
  assert.equal(p['Petites histoires vraies'].disque, 8123456789);
  assert.equal(p['Leviaro'].conteneurs[0].enMarche, false);
});

test('analyse : place, nettoyage possible, conteneur arrêté, mémoire, date du disque plein', () => {
  const donnees = { serveurs: {} };
  const debut = new Date('2026-10-01T00:00:00Z');
  for (let j = 0; j <= 4; j++) {
    const r = lireReleve(texte);
    r.disques[0].utilise += j * 500_000_000; // +0,5 Go par jour
    enregistrerReleve(donnees, 'vps-nour', r, new Date(+debut + j * 86_400_000).toISOString());
  }
  const maintenant = new Date('2026-10-05T00:30:00Z');
  const pente = croissanceParJour(donnees.serveurs['vps-nour'].historique, maintenant);
  assert.ok(Math.abs(pente - 500_000_000) < 1);
  const a = analyser(donnees.serveurs['vps-nour'], config, maintenant);
  assert.equal(a.pctDisque, 86);
  assert.equal(a.enRetard, false);
  assert.ok(a.joursAvantPlein > 0 && a.joursAvantPlein < 14);
  const textes = a.conseils.map((c) => c.texte).join('\n');
  assert.match(textes, /Disque rempli à 86 %/);
  assert.match(textes, /plein dans environ \d+ jours/);
  assert.match(textes, /3,3 Go sont pris par d'anciennes images/);
  assert.match(textes, /leviaro-site/);
  assert.match(textes, /n8n-n8n-1 utilise à lui seul 4\d %/);

  // Plus de relevé depuis 5 h : signalé.
  assert.equal(analyser(donnees.serveurs['vps-nour'], config, new Date('2026-10-05T05:30:00Z')).enRetard, true);
});

test('deux serveurs déséquilibrés : proposition de déplacer le plus gros projet', () => {
  const donnees = { serveurs: {} };
  enregistrerReleve(donnees, 'vps-nour', lireReleve(texte));
  const petit = lireReleve(texte);
  petit.disques[0].utilise = petit.disques[0].total * 0.2;
  enregistrerReleve(donnees, 'vps-youtube', petit);
  const analyses = { 'vps-nour': analyser(donnees.serveurs['vps-nour'], config), 'vps-youtube': analyser(donnees.serveurs['vps-youtube'], config) };
  const c = conseilsEntreServeurs(config, donnees, analyses);
  assert.equal(c.length, 1);
  assert.match(c[0].texte, /Déplacer « Petites histoires vraies » \(7,6 Go\) vers VPS YouTube/);
});

test('vérification : pas encore branché, à jour, puis silence', async () => {
  const dossier = await mkdtemp(path.join(tmpdir(), 'serveurs-'));
  const fichier = path.join(dossier, 'serveurs.json');
  assert.equal((await verifierReleve({ serveur: 'vps-youtube' }, seuils, { fichier })).etat, 'ignore');
  const donnees = { serveurs: {} };
  enregistrerReleve(donnees, 'vps-youtube', lireReleve(texte), '2026-10-05T10:00:00Z');
  await sauverServeurs(fichier, donnees);
  const ok = await verifierReleve({ serveur: 'vps-youtube' }, seuils, { fichier, maintenant: new Date('2026-10-05T10:30:00Z') });
  assert.equal(ok.etat, 'ok');
  assert.match(ok.detail, /disque 81 % utilisé/);
  const silence = await verifierReleve({ serveur: 'vps-youtube' }, seuils, { fichier, maintenant: new Date('2026-10-05T14:30:00Z') });
  assert.equal(silence.etat, 'panne');
});

test('page Serveurs : serveur branché, serveur pas encore branché, texte échappé', () => {
  const donnees = { serveurs: {} };
  const r = lireReleve(texte);
  r.conteneurs[0].nom = '<b>x</b>';
  enregistrerReleve(donnees, 'vps-nour', r);
  const html = pageServeurs(config, donnees);
  assert.match(html, /VPS Nūr/);
  assert.match(html, /Pas encore branché/);
  assert.match(html, /Ce qui tourne dessus/);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(html, /class="actif" data-s="[^"]*">Serveurs/);
});
