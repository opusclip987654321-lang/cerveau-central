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
