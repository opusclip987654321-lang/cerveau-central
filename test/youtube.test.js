import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { referenceChaine, synchroniserYoutube, gainsPeriode } from '../src/youtube.js';
import { tableauDeBord, joursJusqua } from '../src/business.js';
import { pageProjet } from '../src/page-projet.js';

const configJournal = JSON.parse(await readFile(new URL('../config/journal.json', import.meta.url), 'utf8'));
const journalVide = () => ({ evenements: [], n8n: { jours: {}, instances: {} } });

test('referenceChaine comprend les adresses, les @ et les identifiants', () => {
  assert.deepEqual(referenceChaine('https://www.youtube.com/@ExtraitPolitique'), { forHandle: '@ExtraitPolitique' });
  assert.deepEqual(referenceChaine('@extrait.politique'), { forHandle: '@extrait.politique' });
  assert.deepEqual(referenceChaine('https://youtube.com/channel/UCabcdefghij1234'), { id: 'UCabcdefghij1234' });
  assert.deepEqual(referenceChaine('UCabcdefghij1234'), { id: 'UCabcdefghij1234' });
  assert.equal(referenceChaine('nimporte quoi'), null);
});

function fauxYoutube() {
  return async (chemin, params) => {
    if (chemin === 'channels') {
      assert.equal(params.forHandle, '@Extrait');
      return { items: [{ id: 'UCextrait', snippet: { title: "L'extrait politique" }, statistics: { subscriberCount: '1200', viewCount: '90000', videoCount: '310' }, contentDetails: { relatedPlaylists: { uploads: 'UUextrait' } } }] };
    }
    if (chemin === 'playlistItems') {
      assert.equal(params.playlistId, 'UUextrait');
      return { items: [{ contentDetails: { videoId: 'v1' } }, { contentDetails: { videoId: 'v2' } }] };
    }
    if (chemin === 'videos') {
      assert.equal(params.id, 'v1,v2');
      return {
        items: [
          { id: 'v1', snippet: { title: 'Zapping du 4 octobre', publishedAt: '2026-10-04T18:00:00Z' }, statistics: { viewCount: '2300', likeCount: '150' } },
          { id: 'v2', snippet: { title: 'Zapping du 3 octobre', publishedAt: '2026-10-03T18:00:00Z' }, statistics: { viewCount: '1800', likeCount: '90' } },
        ],
      };
    }
    throw new Error(`appel inattendu : ${chemin}`);
  };
}

test('synchroniserYoutube lit la chaîne, ses vidéos et garde un relevé par jour', async () => {
  const b = { sources: {}, objectifs: {} };
  const chaines = { 'extrait-politique': ['https://www.youtube.com/@Extrait'] };
  const r = await synchroniserYoutube(b, { appel: fauxYoutube(), chaines, maintenant: new Date('2026-10-05T12:00:00Z') });
  assert.deepEqual(r, { chaines: 1 });
  const yt = b.sources.youtube;
  assert.equal(yt.chaines[0].abonnes, 1200);
  assert.equal(yt.chaines[0].videos.length, 2);
  assert.deepEqual(yt.historique['2026-10-05'], { UCextrait: { abonnes: 1200, vues: 90000 } });
  // Sans chaîne configurée ou sans clé : on ne fait rien.
  assert.deepEqual(await synchroniserYoutube({ sources: {} }, { chaines: {} }), { ignore: true });
  assert.deepEqual(await synchroniserYoutube({ sources: {} }, { chaines: { x: ['@a'] } }), { ignore: true });
});

test('gains sur la période et carte L’extrait politique', async () => {
  const b = { sources: {}, objectifs: {} };
  await synchroniserYoutube(b, { appel: fauxYoutube(), chaines: { 'extrait-politique': ['@Extrait'] }, maintenant: new Date('2026-10-05T12:00:00Z') });
  const yt = b.sources.youtube;
  yt.historique['2026-09-28'] = { UCextrait: { abonnes: 1150, vues: 84000 } };
  const periode = joursJusqua('2026-10-05', 7);
  assert.deepEqual(gainsPeriode(yt, yt.chaines, periode), { vues: 6000, abonnes: 50 });
  assert.equal(gainsPeriode({ historique: {} }, yt.chaines, periode), null);

  const c = tableauDeBord({ business: b, journal: journalVide(), configJournal, jour: '2026-10-05' }).cartes.find((x) => x.id === 'extrait-politique');
  assert.equal(c.principal.total, 2); // v1 + v2 publiées dans la semaine
  assert.equal(c.chiffres[0].valeur, '6 000'.replace(' ', ' '));
  assert.match(c.chiffres[1].detail, /\+50 sur la période/);
  assert.match(c.manque[0], /revenus YouTube/);

  const html = pageProjet(configJournal, 'extrait-politique', { business: b, journal: journalVide(), idees: { idees: [] }, jour: '2026-10-05' });
  assert.match(html, /Chaînes YouTube/);
  assert.match(html, /1 200 abonnés/);
  assert.match(html, /Zapping du 4 octobre/);
  assert.match(html, /youtube\.com\/watch\?v=v1/);
});
