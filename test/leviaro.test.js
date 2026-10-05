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
    insert into companies (name, state, created_at) values ('A', 'sequence_active', '2026-10-03 10:00:00'), ('B', 'discussion_active', '2026-09-20 10:00:00'), ('C', 'contact_introuvable', '2026-10-04 23:30:00');
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
  assert.deepEqual(lv.entreprises, ['2026-10-03', '2026-09-20', '2026-10-05']); // 23h30 UTC = lendemain à Paris
  assert.equal(lv.aValider, 1);
  assert.equal(lv.enDiscussion, 1);
  assert.equal(lv.recommandations, 1);
  assert.equal(lv.coutMois, 1.23);
  assert.equal(lv.detail.entreprises[0].nom, 'C');
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
