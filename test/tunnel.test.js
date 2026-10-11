import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tunnel, htmlTunnel } from '../src/tunnel.js';

test('tunnel : une étape par passage, « ? » quand la donnée n’est pas branchée, jamais 0', () => {
  const business = {
    sources: {
      impacteur: {
        fiches: [
          { auteur: 'A', statut: 'ENVOYE', envoi: '2026-10-01', ouvert: '2026-10-02' },
          { auteur: 'B', statut: 'ENVOYE', envoi: '2026-10-03' },
          { auteur: 'C', statut: 'A_VERIFIER' },
          { auteur: 'D', statut: 'BROUILLON_CREE' },
        ],
      },
      youtube: {
        chaines: [{ id: 'UC1', projet: 'extrait-politique', abonnes: 1200, videos: [{ id: 'v1', jour: '2026-10-04', vues: 100, format: 'short' }, { id: 'v2', jour: '2026-10-02', vues: 50, format: 'longue' }, { id: 'v0', jour: '2026-08-01', vues: 9, format: 'longue' }] }],
      },
    },
  };
  const im = tunnel('impacteur', business);
  assert.deepEqual(im.etapes.map((x) => [x.n, x.t]), [[4, 'auteurs repérés'], [1, 'à vérifier'], [1, 'brouillons'], [2, 'invités'], [1, 'ont ouvert'], ['?', 'ont répondu'], ['?', 'interviews']]);
  const html = htmlTunnel(im);
  assert.match(html, /<b>2<\/b><span>invités/);
  assert.match(html, /« \? » = pas encore branché : réponses des invités/);
  assert.doesNotMatch(html, /<b>0<\/b><span>ont répondu/);

  const jours30 = Array.from({ length: 30 }, (_, i) => `2026-${String(9 + Math.floor((6 + i) / 30)).padStart(2, '0')}-${String(((6 + i) % 30) + 1).padStart(2, '0')}`);
  const yt = tunnel('extrait-politique', business, { jours30 });
  assert.deepEqual(yt.etapes.slice(0, 4).map((x) => x.n), [2, 1, 1, 150]);
  assert.equal(yt.etapes.at(-1).n, '?'); // revenus pas encore lus
  assert.equal(tunnel('extrait-politique', business), null); // sans période, rien d'inventé
  assert.equal(tunnel('leviaro', business), null);
  assert.equal(htmlTunnel(null), '');
});
