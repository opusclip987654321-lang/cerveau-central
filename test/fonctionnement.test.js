import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chargerFonctionnement } from '../src/fonctionnement.js';
import { pageFonctionnement } from '../src/page-fonctionnement.js';
import { pageProjet } from '../src/page-projet.js';

const configJournal = JSON.parse(await readFile(new URL('../config/journal.json', import.meta.url), 'utf8'));
const dossier = new URL('../config/fonctionnement', import.meta.url).pathname;

test('chaque projet du journal a son guide « Comment ça marche »', async () => {
  const guides = await chargerFonctionnement(dossier);
  for (const p of configJournal.projets.filter((x) => x.id !== 'autre')) {
    assert.ok(guides.has(p.id), `guide manquant pour ${p.id}`);
    const g = guides.get(p.id);
    assert.ok(g.intro && g.maj && g.source, `intro/maj/source manquants pour ${p.id}`);
  }
  // Dossier absent : pas d'erreur, juste aucun guide.
  assert.equal((await chargerFonctionnement('/nulle/part')).size, 0);
});

test('chaque guide respecte le format que la page sait afficher', async () => {
  const guides = await chargerFonctionnement(dossier);
  for (const [id, g] of guides) {
    // Une règle rangée sous une autre clé que `points` s'afficherait en liste vide
    // (c'est arrivé au guide Cambodge) : on vérifie le format de tout ce que la page lit.
    for (const r of g.regles ?? []) assert.ok(Array.isArray(r.points) && r.points.length && r.points.every((p) => typeof p === 'string'), `règle « ${r.titre} » sans points affichables (${id})`);
    for (const a of g.alertes ?? []) assert.ok(a.message && a.sens && a.faire, `alerte incomplète (${id})`);
    for (const v of g.vigilance ?? []) assert.ok(v.sujet && v.detail, `vigilance incomplète (${id})`);
    for (const o of g.outils ?? []) assert.ok(o.nom && o.role, `outil incomplet (${id})`);
    for (const c of g.circuits ?? []) for (const et of c.etapes ?? []) assert.ok(et.texte, `étape sans texte (${id})`);
    for (const l of g.journee ?? []) assert.ok(l.quand && l.quoi && l.toi !== undefined, `journée incomplète (${id})`);
  }
});

test('le guide Cambodge affiche ses règles et chaque guide a ses outils', async () => {
  const guides = await chargerFonctionnement(dossier);
  const html = pageFonctionnement(configJournal, 'cambodge', guides.get('cambodge'));
  // Le texte des règles est bien visible (bug du 06/10 : il était sous `texte`, la page lit `points`).
  assert.match(html, /il n(’|&#39;|')envoie rien et ne touche à rien/);
  assert.match(html, /Outils et API/);
  for (const [id, g] of guides) {
    assert.ok(g.outils?.length, `outils manquants pour ${id}`);
    const page = pageFonctionnement(configJournal, id, g);
    if (page) assert.match(page, /Outils et API/, `section outils absente de la page ${id}`);
  }
  // Croquis de louis (08/10) : chaque étape est reliée à une bulle qui nomme l'outil et son rôle.
  const nm = pageFonctionnement(configJournal, 'nour-meet', guides.get('nour-meet'));
  assert.match(nm, /<div class="trait"><\/div><div class="bulle"><b>Google Places<\/b><span>API de Google Maps/);
  assert.match(nm, /<div class="bulle regle"><b>Règle automatique<\/b>/);
  assert.doesNotMatch(nm.slice(nm.indexOf('id="circuit-1"'), nm.indexOf('Outils et API')), /n8n/);
});

test('chaque étape a sa partie technique, jamais avec n8n', async () => {
  const guides = await chargerFonctionnement(dossier);
  for (const [id, g] of guides) {
    for (const c of g.circuits ?? []) for (const et of c.etapes ?? []) {
      // louis (08/10) : à droite, le service et le côté technique de l'étape, pas n8n.
      assert.ok(et.technique, `étape sans partie technique : « ${et.texte} » (${id})`);
      assert.doesNotMatch(`${et.outil ?? ''} ${et.technique}`, /n8n/i, `n8n sur « ${et.texte} » (${id})`);
      // Pas de redite : la bulle ne recopie pas la case.
      assert.notEqual(et.technique, et.texte, `bulle identique à la case (${id})`);
    }
  }
});

test('la page du guide reprend le format du PDF v4', async () => {
  const guides = await chargerFonctionnement(dossier);
  const html = pageFonctionnement(configJournal, 'extrait-politique', guides.get('extrait-politique'));
  assert.match(html, /Comment fonctionne <b>L(’|&#39;|')extrait politique<\/b>/);
  assert.match(html, /La journée type/);
  assert.match(html, /Tu dois faire quelque chose \?/);
  assert.match(html, /circuit 1/);
  assert.match(html, /contrôle de sécurité/);
  assert.match(html, /Les règles appliquées/);
  assert.match(html, /Alertes et quoi faire/);
  assert.match(html, /Ton rôle/);
  assert.match(html, /TF1 : veille seulement, jamais d(’|&#39;|')extrait/);
  assert.equal(pageFonctionnement(configJournal, 'inconnu', guides.get('extrait-politique')), null);
});

test('le guide Nūr Meet signale ce qui reste à compléter, et la page projet pointe vers le guide', async () => {
  const guides = await chargerFonctionnement(dossier);
  const html = pageFonctionnement(configJournal, 'nour-meet', guides.get('nour-meet'));
  assert.match(html, /Pour compléter ce guide/);
  assert.match(html, /rendez-vous et démos/);
  // louis (05/10) : pas de validation avant envoi, c'est son choix.
  assert.match(html, /Aucune validation avant envoi/);

  const projet = pageProjet(configJournal, 'nour-meet', {
    business: { sources: {}, objectifs: {} },
    journal: { evenements: [], n8n: { jours: {}, instances: {} } },
    idees: { idees: [] },
    jour: '2026-10-05',
    guide: true,
  });
  assert.match(projet, /fonctionnement\?projet=nour-meet/);
  assert.match(projet, /Comment ça marche/);
});
