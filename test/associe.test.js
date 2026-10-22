import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lireAssocie, ideesDuJour, htmlAssocie } from '../src/associe.js';

async function fichier(contenu) {
  const d = await mkdtemp(path.join(tmpdir(), 'associe-'));
  const f = path.join(d, 'x.json');
  if (contenu !== undefined) await writeFile(f, contenu);
  return f;
}

test('lecture : absent = null, illisible = erreur', async () => {
  assert.equal(await lireAssocie(await fichier()), null);
  assert.match((await lireAssocie(await fichier('{oups'))).erreur, /illisible/);
});

test('idées : le jour le plus récent par défaut', () => {
  const idees = { jours: [{ date: '2026-10-22', idees: [{ titre: 'A' }] }, { date: '2026-10-23', idees: [{ titre: 'B' }] }, { date: 'oups' }] };
  assert.equal(ideesDuJour(idees).date, '2026-10-23');
  assert.equal(ideesDuJour(idees, '2026-10-22').idees[0].titre, 'A');
  assert.equal(ideesDuJour({ jours: [] }), null);
});

test('page : vide, puis avec la revue du dépôt et des idées, texte échappé', async () => {
  assert.match(htmlAssocie(null, null), /Pas encore de revue/);
  const fortune = await lireAssocie(new URL('../config/loops/fortune.json', import.meta.url).pathname);
  assert.ok(fortune.classement.length >= 5, 'le fichier du dépôt se lit');
  const html = htmlAssocie(fortune, { jours: [{ date: '2026-10-22', idees: [{ categorie: 'economie', titre: 'Couper <X>', detail: 'gain 7 €' }] }] }, { maintenant: new Date('2026-10-23T10:00:00Z') });
  assert.match(html, /Nūr Meet restaurateurs/);
  assert.match(html, /Ce que ton associé propose/);
  assert.match(html, /Enveloppe de l’associé/);
  assert.match(html, /Couper &lt;X&gt;/);
  assert.doesNotMatch(html, /ancienne/);
  assert.match(htmlAssocie(fortune, null, { maintenant: new Date('2026-11-10T10:00:00Z') }), /ancienne/);
});
