import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { faitDuJour, htmlFait, ligneNotion, lireFaitNotion, PROJETS_NOTION } from '../src/fait.js';
import { pageAujourdhui, pageFait } from '../src/page-aujourdhui.js';

const configJournal = JSON.parse(await readFile(new URL('../config/journal.json', import.meta.url), 'utf8'));
const jour = '2026-10-23';

const business = () => ({
  sources: {
    prospection: {
      prospects: [{ nom: 'Chez Ali', email: true, decouvert: jour }, { nom: 'Le Riad', email: false, decouvert: jour }, { nom: 'Vieux', email: true, decouvert: '2026-10-01' }],
      envois: [{ nom: 'Chez Ali', statut: 'envoye', jour }, { nom: 'Le Riad', statut: 'echec', jour }, { nom: 'Vieux', statut: 'envoye', jour: '2026-10-22' }],
      ouvertures: [],
      reponses: [{ jour, nom: 'Le Zaatar' }],
    },
    leviaro: { entreprises: [jour, jour, '2026-10-20'], envois: [{ etape: 0, jour }, { etape: 1, jour }], reponses: [] },
    impacteur: { fiches: [{ auteur: 'Awa Diop', statut: 'ENVOYE', envoi: jour }, { auteur: 'Ancien', statut: 'ENVOYE', envoi: '2026-10-01' }] },
    youtube: { chaines: [], flux: { chaines: { UC1: { projet: 'histoires-vraies', titre: 'Petites histoires vraies', videos: [{ id: 'abc', titre: 'Le chien fidèle', jour }] } } } },
    boites: { maj: `${jour}T08:00:00Z`, etat: { a: { lue: true }, b: { lue: true }, c: { lue: false } }, mails: [{ jour }] },
    nourPublic: { posts: [{ jour, fb: true, insta: false, format: 'carrousel' }] },
  },
});
const journal = () => ({
  evenements: [{ id: 'x', jour, date: `${jour}T09:00:00Z`, projet: 'cambodge', type: 'mail', titre: 'Candidature envoyée', source: 'n8n' }],
  n8n: { jours: { [jour]: { 'Nour Meet 1 - Recherche': { ok: 2, erreur: 1 } } }, instances: {} },
});
const decisions = { decisions: [{ loop: 'phv', date: jour, type: 'Changé', quoi: 'Titres plus courts', notion: true }, { loop: 'phv', date: '2026-10-01', type: 'Gardé', quoi: 'Vieux' }] };
const faitNotion = { maj: `${jour}T10:00:00Z`, lignes: [{ id: 'n1', jour, quand: `${jour}T12:30:00Z`, projet: 'impacteur', quoi: '40 MP Instagram envoyés pour Patreon', nombre: 40, lien: null, par: 'Fil Patreon' }] };

test('faitDuJour : tout ce qui a été fait ce jour-là, rangé par projet, rien des autres jours', () => {
  const f = faitDuJour({ business: business(), journal: journal(), configJournal, decisions, faitNotion, jour });
  const p = Object.fromEntries(f.projets.map((x) => [x.id, x]));
  const textes = (id) => p[id].lignes.map((l) => l.texte).join(' | ');
  assert.match(textes('nour-meet'), /2 restaurants trouvés .*1 adresse trouvée/);
  assert.match(textes('nour-meet'), /1 mail de prospection envoyé/);
  assert.match(textes('nour-meet'), /1 réponse de restaurant lue/);
  assert.match(textes('nour-meet'), /Post publié sur Facebook \(carrousel\)/);
  assert.match(textes('leviaro'), /2 entreprises trouvées/);
  assert.match(textes('leviaro'), /2 mails de prospection envoyés \(1 premiers contacts, 1 relances\)/);
  assert.match(textes('impacteur'), /1 invitation envoyée/);
  assert.equal(p.impacteur.lignes.find((l) => /invitation/.test(l.texte)).detail, 'Awa Diop');
  assert.match(textes('impacteur'), /40 MP Instagram envoyés pour Patreon/);
  assert.doesNotMatch(textes('impacteur'), /\(40\)/, 'le nombre déjà dans la phrase n’est pas répété');
  assert.match(textes('histoires-vraies'), /Vidéo publiée : Le chien fidèle/);
  assert.match(textes('histoires-vraies'), /Changé : Titres plus courts/);
  assert.doesNotMatch(textes('histoires-vraies'), /Vieux/);
  assert.match(textes('cerveau'), /2 boîtes mail relues .*1 mail important repéré/);
  assert.match(textes('cambodge'), /Candidature envoyée/);
  assert.deepEqual(p['nour-meet'].automatisations, [{ nom: 'Nour Meet 1 - Recherche', ok: 2, erreur: 1 }]);
  assert.equal(f.executions, 2);
  assert.equal(f.erreurs, 1);
  assert.equal(f.projets[0].id, 'nour-meet', 'ordre de config/journal.json');
});

test('faitDuJour : un jour vide ne plante pas et ne montre rien', () => {
  const f = faitDuJour({ configJournal, jour });
  assert.equal(f.total, 0);
  assert.match(htmlFait(f), /Rien d’enregistré/);
});

test('ligneNotion : lit une ligne de la table « Fait pour Walid »', () => {
  const l = ligneNotion({
    id: 'p1',
    properties: {
      Quoi: { title: [{ plain_text: '12 adresses de prospects trouvées' }] },
      Date: { date: { start: '2026-10-23T23:30:00+02:00' } },
      Projet: { select: { name: 'Leviaro' } },
      Nombre: { number: 12 },
      Lien: { url: 'javascript:alert(1)' },
      Par: { rich_text: [{ plain_text: 'Loop Leviaro' }] },
    },
  });
  assert.equal(l.jour, '2026-10-23', 'jour à Paris');
  assert.equal(l.projet, 'leviaro');
  assert.equal(l.nombre, 12);
  assert.equal(l.lien, null, 'lien non http refusé');
  assert.equal(ligneNotion({ id: 'p2', properties: { Date: { date: { start: '2026-10-23' } } } }), null, 'sans texte : ignorée');
  assert.equal(ligneNotion({ id: 'p3', properties: { Quoi: { title: [{ plain_text: 'x' }] }, Date: { date: { start: '2026-10-23' } }, Projet: { select: { name: 'Inconnu' } } } }).projet, 'autre');
  assert.ok(Object.values(PROJETS_NOTION).includes('histoires-vraies'));
});

test('lireFaitNotion : interroge la table filtrée sur 14 jours, sans jeton ne fait rien', async () => {
  const donnees = { lignes: [] };
  assert.deepEqual(await lireFaitNotion(donnees, {}), { ignore: true });
  const appels = [];
  const f = async (url, opts) => {
    appels.push({ url, corps: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ results: [{ id: 'a', properties: { Quoi: { title: [{ plain_text: 'Vidéo fabriquée' }] }, Date: { date: { start: jour } }, Projet: { select: { name: 'Petites histoires vraies' } } } }], has_more: false }) };
  };
  const r = await lireFaitNotion(donnees, { jeton: 't', fetch: f, maintenant: new Date(`${jour}T10:00:00Z`) });
  assert.equal(r.lignes, 1);
  assert.match(appels[0].url, /data_sources\/42ba9598-5222-4a19-8868-805d96950346\/query/);
  assert.equal(appels[0].corps.filter.date.on_or_after, '2026-10-09');
  assert.equal(donnees.lignes[0].projet, 'histoires-vraies');
  assert.ok(donnees.maj);
});

test('pages : la section est sur Aujourd’hui, la page /fait navigue entre les jours', () => {
  const fait = faitDuJour({ business: business(), journal: journal(), configJournal, decisions, faitNotion, jour });
  const html = pageAujourdhui({ lignes: [], priorites: [], fait, jour });
  assert.match(html, /J’ai fait aujourd’hui · \d+/);
  assert.match(html, /href="\/fait\?jour=2026-10-22"/);
  assert.match(html, /Fil Patreon/);
  assert.match(html, /youtu\.be\/abc/);
  const page = pageFait({ ...fait, jour: '2026-10-22' }, jour);
  assert.match(page, /Lendemain ›/);
  assert.match(page, /\/fait\?jour=2026-10-21/);
});
