import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiffresProjets, dernieresDecisions, etatProjet, texteDecision, tenirTableauNotion, PROJETS } from '../src/tableau-notion.js';

const maintenant = new Date('2026-10-21T15:00:00Z');

test('chiffres : tout absent = « indisponible », jamais 0', () => {
  const c = chiffresProjets({ business: { sources: {} }, loopNour: null, loopHistoires: null, maintenant });
  assert.deepEqual(Object.keys(c).sort(), Object.keys(PROJETS).sort());
  for (const x of Object.values(c)) {
    assert.equal(x.principal, 'indisponible');
    assert.equal(x.secondaire, 'indisponible');
    assert.equal(x.donnees, false);
  }
});

test('chiffres : lus dans les sources du cerveau', () => {
  const business = {
    sources: {
      stripe: { abonnements: { actifs: 2 } },
      prospection: { prospects: [{ nom: 'A', premier: '2026-10-01' }, { nom: 'B', premier: '2026-10-02' }, { nom: 'C' }], envois: [], reponses: [] },
      nourPublic: { maj: maintenant.toISOString(), comptesTotal: 11, posts: [], soirees: [{ demo: false }], tunnel: {} },
      visites: { sites: { 'nour-meet': { parJour: [{ jour: '2026-10-21', visites: 5 }, { jour: '2026-10-15', visites: 3 }, { jour: '2026-10-10', visites: 100 }] } } },
      vegebudget: { totaux: { abonnes: 0, membres: 2 }, jours: [{ visiteurs: 4 }, { visiteurs: 6 }] },
      impacteur: {
        reponsesMesurees: true,
        fiches: [
          { envoi: '2026-10-20', reponseType: 'OUI_INTERVIEW+LIVRE_ACCEPTE' },
          { envoi: '2026-10-19', reponseType: 'A_CLASSER' },
          { envoi: '2026-10-01', reponseType: null },
        ],
      },
      leviaro: { reponses: [{}, {}], enDiscussion: 1, envois: [{ etape: 0 }, { etape: 1 }, { etape: 0 }] },
    },
  };
  const loopHistoires = { maj: '2026-10-20T14:56:39Z', objectifs: { abonnes: { actuel: 26 }, heures: { actuel: 7.7 } } };
  const c = chiffresProjets({ business, loopNour: { reponses: {} }, loopHistoires, maintenant });
  assert.equal(c['nour-restos'].principal, '2 restos payants');
  assert.equal(c['nour-restos'].secondaire, '0 intéressé · 2 contactés');
  assert.equal(c['nour-grand-public'].principal, '11 comptes particuliers');
  assert.equal(c['nour-grand-public'].secondaire, '8 visites sur 7 j');
  assert.equal(c.vegebudget.principal, '0 abonné payant');
  assert.equal(c.vegebudget.secondaire, '2 inscrits · 10 visiteurs sur 30 j');
  assert.equal(c['petites-histoires'].principal, '26 abonnés YouTube');
  assert.equal(c['petites-histoires'].secondaire, '7,7 h de vues');
  assert.equal(c['petites-histoires'].alerte, false);
  assert.equal(c.impacteur.principal, '1 oui interview · 1 livre accepté (1 à classer)');
  assert.equal(c.impacteur.secondaire, '2 invitations sur 7 j');
  assert.equal(c['impacteur-sponsors'].principal, 'indisponible');
  assert.equal(c.leviaro.principal, '2 réponses · 1 en discussion');
  assert.equal(c.leviaro.secondaire, '2 mails envoyés');
});

test('alertes : réseau muet du grand public, compte rendu PHV trop vieux', () => {
  const business = { sources: { nourPublic: { maj: maintenant.toISOString(), comptesTotal: 1, posts: [{ jour: '2026-10-10', insta: true, fb: true }], soirees: [], tunnel: {} } } };
  const c = chiffresProjets({ business, loopHistoires: { maj: '2026-10-01T00:00:00Z', objectifs: {} }, maintenant });
  assert.equal(c['nour-grand-public'].alerte, true);
  assert.equal(c['petites-histoires'].alerte, true);
});

test('état et dernière décision', () => {
  const d = dernieresDecisions([
    { loop: 'Leviaro', date: '2026-10-20', quoi: 'Ancienne' },
    { loop: 'Leviaro', date: '2026-10-21', quoi: 'Récente' },
    { loop: 'Impacteur Sponsors', date: '2026-10-05', quoi: 'Vieille' },
    { loop: null, date: '2026-10-21', quoi: 'sans loop' },
  ]);
  assert.equal(d.Leviaro.quoi, 'Récente');
  assert.equal(texteDecision(d.Leviaro), '21/10 : Récente');
  assert.equal(texteDecision(null), 'aucune pour l’instant');
  assert.equal(texteDecision({ date: '2026-10-21', quoi: 'x'.repeat(300) }).length, 160);
  assert.equal(etatProjet({ donnees: true, alerte: true, decision: null }, maintenant), 'Bloqué');
  assert.equal(etatProjet({ donnees: false, decision: null }, maintenant), 'Pas démarré');
  assert.equal(etatProjet({ donnees: false, decision: d['Impacteur Sponsors'] }, maintenant), 'En attente');
  assert.equal(etatProjet({ donnees: false, decision: d.Leviaro }, maintenant), 'Tourne');
  assert.equal(etatProjet({ donnees: true, decision: null }, maintenant), 'Tourne');
});

test('tenirTableauNotion : lit les deux tables et réécrit les lignes connues', async () => {
  const appels = [];
  const fakeFetch = async (url, { method, body }) => {
    appels.push({ url, method, body: JSON.parse(body) });
    const ok = (json) => ({ ok: true, json: async () => json });
    if (url.includes('data_sources/DEC/query'))
      return ok({ results: [{ properties: { Loop: { select: { name: 'Leviaro' } }, Date: { date: { start: '2026-10-20' } }, Décision: { title: [{ plain_text: 'Tâches sur l’abonnement' }] } } }], has_more: false });
    if (url.includes('data_sources/PRO/query'))
      return ok({ results: [{ id: 'p1', properties: { Clé: { rich_text: [{ plain_text: 'leviaro' }] } } }, { id: 'p2', properties: { Clé: { rich_text: [{ plain_text: 'inconnue' }] } } }], has_more: false });
    return ok({});
  };
  const chiffres = chiffresProjets({ business: { sources: {} }, maintenant });
  assert.deepEqual(await tenirTableauNotion(chiffres, { jeton: '' }), { ignore: true });
  const r = await tenirTableauNotion(chiffres, { jeton: 'j', sourceProjets: 'PRO', sourceDecisions: 'DEC', fetch: fakeFetch, maintenant });
  assert.equal(r.ecrites, 1);
  const patch = appels.find((a) => a.method === 'PATCH');
  assert.match(patch.url, /pages\/p1$/);
  const p = patch.body.properties;
  assert.equal(p['Chiffre principal'].rich_text[0].text.content, 'indisponible');
  assert.equal(p['Dernière décision'].rich_text[0].text.content, '20/10 : Tâches sur l’abonnement');
  assert.equal(p['État'].select.name, 'Tourne');
  assert.equal(p['Mis à jour'].date.start, maintenant.toISOString());
});

test('tenirTableauNotion : la loop Sponsors écrit ses chiffres elle-même, le cerveau n’y touche pas', async () => {
  const patchs = [];
  const fakeFetch = async (url, { method, body }) => {
    if (method === 'PATCH') patchs.push(JSON.parse(body));
    const ok = (json) => ({ ok: true, json: async () => json });
    if (url.includes('data_sources/DEC/query'))
      return ok({ results: [{ properties: { Loop: { select: { name: 'Impacteur Sponsors' } }, Date: { date: { start: '2026-10-21' } }, Décision: { title: [{ plain_text: 'Tour 4' }] } } }], has_more: false });
    if (url.includes('data_sources/PRO/query')) return ok({ results: [{ id: 's1', properties: { Clé: { rich_text: [{ plain_text: 'impacteur-sponsors' }] } } }], has_more: false });
    return ok({});
  };
  await tenirTableauNotion(chiffresProjets({ business: { sources: {} }, maintenant }), { jeton: 'j', sourceProjets: 'PRO', sourceDecisions: 'DEC', fetch: fakeFetch, maintenant });
  const p = patchs[0].properties;
  assert.equal(p['Chiffre principal'], undefined);
  assert.equal(p['Chiffre secondaire'], undefined);
  assert.equal(p['Dernière décision'].rich_text[0].text.content, '21/10 : Tour 4');
  assert.equal(p['État'].select.name, 'Tourne');
});
