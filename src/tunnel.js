// Le tunnel de chaque projet : d'où l'on part (trouvés, visiteurs, vidéos) jusqu'à
// ce qui compte (client, abonné, revenu), en comptant ce que les données disent.
// Une étape dont la donnée n'est pas branchée affiche « ? », jamais 0.
const somme = (t) => t.reduce((a, b) => a + b, 0);

export function tunnel(id, business, { jours30 = null } = {}) {
  const s = business.sources ?? {};
  switch (id) {
    case 'nour-meet': {
      const pr = s.prospection;
      if (!pr) return null;
      const ab = s.stripe?.abonnements;
      return {
        titre: 'Parcours commercial',
        note: 'Restaurants, depuis le début.',
        etapes: [
          { n: pr.prospects.length, t: 'trouvés' },
          { n: pr.prospects.filter((x) => x.email).length, t: 'contactables' },
          { n: pr.prospects.filter((x) => x.premier).length, t: 'contactés' },
          { n: pr.prospects.filter((x) => x.reponse).length, t: 'ont répondu' },
          { n: '?', t: 'rendez-vous', manque: 'rendez-vous / démos' },
          { n: ab?.actifs ?? '?', t: 'abonnés payants', manque: ab ? null : 'Stripe' },
        ],
      };
    }
    case 'leviaro': {
      const lv = s.leviaro;
      if (!lv) return null;
      const ent = lv.detail?.entreprises ?? [];
      const etat = (...etats) => ent.filter((c) => etats.includes(c.etat)).length;
      const trouvees = ent.length || somme([lv.entreprises?.length ?? 0]);
      return {
        titre: 'Parcours commercial',
        note: 'Entreprises, depuis le début. Un mail ne part que si le dossier atteint 80/100 (règle de l’agent).',
        etapes: [
          { n: trouvees, t: 'trouvées' },
          { n: ent.length ? trouvees - etat('decouverte') : '?', t: 'étudiées' },
          { n: ent.length ? etat('attente_validation', 'sequence_active', 'discussion_active', 'cloturee') : '?', t: 'contact trouvé' },
          { n: lv.envois.filter((m) => m.etape === 0).length, t: 'contactées' },
          { n: lv.suivi?.entreprisesOuvertes ?? '?', t: 'ont ouvert le mail', manque: lv.suivi?.ouvertures ? null : 'ouvertures (pixel de l’agent)' },
          { n: lv.suivi?.entreprisesCliquees ?? '?', t: 'ont cliqué vers le site', manque: lv.suivi?.clics ? null : 'clics sur le lien (agent)' },
          { n: lv.reponses.length, t: 'ont répondu' },
          { n: lv.enDiscussion ?? '?', t: 'en discussion' },
          { n: '?', t: 'clientes', manque: 'clients signés' },
        ],
      };
    }
    case 'impacteur': {
      const im = s.impacteur;
      if (!im) return null;
      const f = im.fiches;
      const envoyes = f.filter((x) => x.envoi);
      return {
        titre: 'Parcours des invitations',
        note: 'Fiches du Sheet, depuis le début.',
        etapes: [
          { n: f.length, t: 'auteurs repérés' },
          { n: f.filter((x) => x.statut?.startsWith('A_VERIFIER')).length, t: 'à vérifier' },
          { n: f.filter((x) => x.statut === 'BROUILLON_CREE').length, t: 'brouillons' },
          { n: envoyes.length, t: 'invités' },
          { n: envoyes.filter((x) => x.ouvert).length, t: 'ont ouvert' },
          { n: '?', t: 'ont répondu', manque: 'réponses des invités (boîtes Gmail)' },
          { n: '?', t: 'interviews', manque: 'interviews acceptées' },
        ],
      };
    }
    case 'vegebudget': {
      const vb = s.vegebudget;
      if (!vb?.jours) return null;
      const derniers = vb.jours.slice(-30);
      const tot = (cle) => somme(derniers.map((j) => j[cle] ?? 0));
      return {
        titre: 'Parcours des visiteurs',
        note: '30 derniers jours, sauf les abonnés (en tout).',
        etapes: [
          { n: tot('visiteurs'), t: 'visiteurs' },
          { n: tot('semaines'), t: 'ont composé une semaine' },
          { n: tot('inscrits'), t: 'inscrits' },
          { n: tot('clicsPayer'), t: 'ont cliqué sur payer' },
          { n: vb.totaux?.abonnes ?? '?', t: 'abonnés payants' },
        ],
      };
    }
    case 'extrait-politique':
    case 'histoires-vraies': {
      const chaines = (s.youtube?.chaines ?? []).filter((c) => c.projet === id);
      if (!chaines.length || !jours30) return null;
      const videos = chaines.flatMap((c) => c.videos).filter((v) => v.jour && jours30.includes(v.jour));
      const rev = s.youtube?.revenus?.parChaine;
      const revenus = rev ? chaines.reduce((t, c) => t + somme(jours30.map((j) => rev[c.id]?.[j] ?? 0)), 0) : null;
      return {
        titre: 'Parcours des vidéos',
        note: '30 derniers jours, d’après YouTube.',
        etapes: [
          { n: videos.length, t: 'vidéos publiées' },
          { n: videos.filter((v) => v.format === 'short').length, t: 'shorts', petit: true },
          { n: videos.filter((v) => v.format === 'longue').length, t: 'longues', petit: true },
          { n: somme(videos.map((v) => v.vues)), t: 'vues de ces vidéos' },
          { n: chaines.reduce((t, c) => t + c.abonnes, 0), t: 'abonnés' },
          { n: revenus === null ? '?' : `${Math.round(revenus * 100) / 100} €`, t: 'revenus', manque: revenus === null ? 'revenus YouTube' : null },
        ],
      };
    }
    case 'cambodge': {
      const cb = s.cambodge;
      if (!cb?.mails) return null;
      return {
        titre: 'Parcours des candidatures',
        note: 'Depuis le début, d’après la boîte mail.',
        etapes: [
          { n: cb.mails.filter((m) => m.deMoi || m.automatique).length, t: 'candidatures' },
          { n: cb.mails.filter((m) => !m.deMoi && !m.automatique).length, t: 'réponses' },
          { n: '?', t: 'entretiens', manque: 'entretiens (à noter dans le journal)' },
        ],
      };
    }
    default:
      return null;
  }
}

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function htmlTunnel(t) {
  if (!t) return '';
  const manques = t.etapes.filter((x) => x.manque).map((x) => x.manque);
  return `<section class="bloc tunnel"><h3>${e(t.titre)}</h3>
<div class="parcours">${t.etapes
    .map((x) => `<div class="etape${x.petit ? ' petite' : ''}${x.n === '?' ? ' inconnue' : ''}"><b>${typeof x.n === 'number' ? x.n.toLocaleString('fr-FR') : e(x.n)}</b><span>${e(x.t)}</span></div>`)
    .join('<span class="fleche-p">›</span>')}</div>
<p class="vide">${e(t.note)}${manques.length ? ` « ? » = pas encore branché : ${e(manques.join(', '))}.` : ''}</p></section>`;
}
