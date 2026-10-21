// Nūr Meet côté grand public (loop du 19/10) : ce que le site lui-même sait des
// particuliers, des soirées et des posts Instagram / Facebook. Le cerveau ne lit
// pas la base du site : un relevé (scripts/nour-public-releve.sh, cron sur le VPS
// Nūr) la lit en lecture seule et l'envoie ici chaque heure. C'est la « mesure »
// de la loop : comptes créés, candidatures, places payées, soirées à vendre, et
// surtout si chaque réseau publie encore (Instagram et Facebook sont restés
// muets deux semaines en octobre sans que personne ne le voie).
const entier = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : null);
const texte = (v, max = 200) => (v === null || v === undefined || v === '' ? null : String(v).slice(0, max));
const jour = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null);
const liste = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const parJour = (v) => liste(v, 400).map((x) => ({ jour: jour(x?.jour), n: entier(x?.n) ?? 0 })).filter((x) => x.jour);

// Nettoie le relevé reçu : rien d'autre que ce qui est attendu, bornes partout.
export function lireNourPublic(brut, maintenant = new Date()) {
  if (!brut || typeof brut !== 'object') throw new Error('relevé vide');
  return {
    maj: maintenant.toISOString(),
    comptesTotal: entier(brut.comptesTotal),
    tunnel: { visiteurs: entier(brut.tunnel?.visiteurs), explorent: entier(brut.tunnel?.explorent), soirees: entier(brut.tunnel?.soirees) },
    comptes: parJour(brut.comptes),
    candidatures: parJour(brut.candidatures),
    places: parJour(brut.places),
    soirees: liste(brut.soirees, 30).map((s) => ({
      titre: texte(s?.titre, 120) ?? 'Soirée',
      lieu: texte(s?.lieu, 80),
      quand: texte(s?.quand, 30),
      places: entier(s?.places),
      inscrits: entier(s?.inscrits) ?? 0,
      minimum: entier(s?.minimum),
      demo: Boolean(s?.demo),
    })),
    posts: liste(brut.posts, 60)
      .map((p) => ({
        jour: jour(p?.jour),
        insta: Boolean(p?.insta),
        instaErreur: texte(p?.instaErreur),
        fb: Boolean(p?.fb),
        fbErreur: texte(p?.fbErreur),
        portee: entier(p?.portee),
        abonnes: entier(p?.abonnes),
        profil: entier(p?.profil),
        format: texte(p?.format, 20),
      }))
      .filter((p) => p.jour)
      .sort((a, b) => a.jour.localeCompare(b.jour)),
    lecons: liste(brut.lecons, 5).map((x) => texte(x, 300)).filter(Boolean),
    // Le journal daté des décisions de la loop (20/10) : ce qu'elle change, garde ou arrête, et pourquoi.
    decisions: liste(brut.decisions, 30).map((x) => ({ date: jour(x?.date), type: texte(x?.type, 20), quoi: texte(x?.quoi, 600), pourquoi: texte(x?.pourquoi, 1500) })).filter((x) => x.date && x.quoi),
    origines: liste(brut.origines, 15).map((o) => ({ source: texte(o?.source, 80) ?? 'direct', n: entier(o?.n) ?? 0 })),
  };
}

export function enregistrerNourPublic(business, donnees) {
  business.sources ??= {};
  business.sources.nourPublic = donnees;
  return donnees;
}

const joursEntre = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86_400_000);
const jourParis = (d) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const somme = (l) => l.reduce((a, x) => a + x.n, 0);
const depuis = (l, debut) => somme(l.filter((x) => x.jour >= debut));

// Pourquoi une publication a échoué (louis, 21/10 : plus d'e-mail, c'est au cerveau de le savoir et de
// le comprendre). Le site garde le message de Meta, précédé depuis le 21/10 de son code et sous-code
// (« Instagram (403, code 4, sous-code 2207051) : … ») ; les anciens messages, sans code, se lisent au
// texte. `qui` dit qui agit : la loop (image, format, légende), personne (attendre que Meta lève une
// limite ou se remette d'une panne), ou louis (clé, permission, compte bridé : lui seul peut le faire).
// Une limite d'appels qui dure 10 jours ou plus n'est plus passagère : c'est le compte qui est bloqué,
// seul le support Meta peut le débloquer (Instagram, octobre 2026).
const CAUSES = [
  { id: 'publie-non-note', test: (m) => /^Publié \(/.test(m), cause: 'Publié chez Meta mais pas noté sur le site', qui: 'loop', faire: 'Vérifier le post sur le réseau et le noter sur l’article avant tout nouvel essai.' },
  { id: 'cle', codes: [190], test: (m) => /access token|session has expired|token.{0,20}(expired|invalid)|jeton/i.test(m), cause: 'Clé Meta expirée ou invalidée', qui: 'louis', faire: 'Refaire la clé : demander la marche à Claude dans le fil « Loop Nūr Meet grand public ».' },
  { id: 'permission', codes: [10, 200, 270], test: (m) => /permission/i.test(m), cause: 'Permission retirée à l’appli Meta', qui: 'louis', faire: 'Redonner la permission à l’appli Meta : demander la marche à Claude dans le fil « Loop Nūr Meet grand public ».' },
  { id: 'compte-bride', codes: [368], test: (m) => /temporarily blocked|blocked from|restricted|spam/i.test(m), cause: 'Compte bridé par Meta (abus présumé)', qui: 'louis', faire: 'Écrire au support Meta Business pour faire lever la restriction.' },
  { id: 'limite-appels', codes: [4, 17, 32, 613], test: (m) => /request limit|rate limit|too many calls/i.test(m), cause: 'Limite d’appels Meta', qui: 'attendre', faire: 'Ne pas multiplier les essais : Meta lève la limite seul.' },
  { id: 'plafond-posts', codes: [9], sousCodes: [2207042], test: (m) => /maximum number of posts|publishing limit/i.test(m), cause: 'Plafond de publications sur 24 h atteint', qui: 'attendre', faire: 'Rien : le post du lendemain repartira.' },
  { id: 'image', codes: [36000, 36001, 36003, 36004], sousCodes: [2207003, 2207004, 2207005, 2207009, 2207020, 2207026, 2207052, 2207053], test: (m) => /Traitement du média refusé|aspect ratio|Image refusée|Image introuvable|Photo de photothèque|media type|image/i.test(m), cause: 'Image refusée par Meta', qui: 'loop', faire: 'Revoir le format des visuels (taille, ratio, poids).' },
  { id: 'article-court', test: (m) => /trop court/i.test(m), cause: 'Article trop court pour un carrousel', qui: 'loop', faire: 'Choisir des articles assez longs pour 4 slides au moins.' },
  { id: 'legende', sousCodes: [2207008, 2207010], test: (m) => /caption|hashtag/i.test(m), cause: 'Légende refusée', qui: 'loop', faire: 'Raccourcir la légende ou réduire les hashtags (30 au plus).' },
  { id: 'panne', codes: [1, 2], test: (m) => /pas fini de traiter|timeout|aborted|fetch failed|ECONN|unexpected error|temporar|unavailable|\(5\d\d\b/i.test(m), cause: 'Panne passagère chez Meta ou du réseau', qui: 'attendre', faire: 'Rien si le post suivant passe.' },
];
const QUI = { loop: 'la loop corrige', attendre: 'attendre', louis: 'à toi d’agir' };

export function causeMeta(erreur, joursMuet = null) {
  if (!erreur) return null;
  const m = String(erreur);
  const code = Number(m.match(/\bcode (\d+)/)?.[1] ?? NaN);
  const sousCode = Number(m.match(/sous-code (\d+)/)?.[1] ?? NaN);
  const c = CAUSES.find((x) => x.sousCodes?.includes(sousCode)) ?? CAUSES.find((x) => x.codes?.includes(code)) ?? CAUSES.find((x) => x.test(m));
  const codes = [Number.isFinite(code) ? `code ${code}` : '', Number.isFinite(sousCode) ? `sous-code ${sousCode}` : ''].filter(Boolean).join(', ') || null;
  if (!c) return { id: 'inconnue', cause: 'Cause non reconnue', qui: 'loop', faire: 'Lire le message de Meta et corriger, ou demander à Claude.', codes };
  if (c.id === 'limite-appels' && joursMuet !== null && joursMuet >= 10) {
    return { ...c, id: 'compte-bloque', cause: `Limite d’appels Meta depuis ${joursMuet} jours : compte bloqué`, qui: 'louis', faire: 'Écrire au support Meta Business : la limite ne se lève pas seule.', codes };
  }
  return { id: c.id, cause: c.cause, qui: c.qui, faire: c.faire, codes };
}

// État de chaque réseau : dernier post réussi, l'erreur du dernier essai s'il a échoué et sa cause.
export function etatReseaux(np, maintenant = new Date()) {
  const posts = np?.posts ?? [];
  const reseau = (ok, erreur) => {
    const reussis = posts.filter((p) => p[ok]);
    const dernier = posts.at(-1);
    const dernierPost = reussis.at(-1)?.jour ?? null;
    const err = dernier && !dernier[ok] ? dernier[erreur] : null;
    const muet = dernierPost ? joursEntre(dernierPost, jourParis(maintenant)) : null;
    return { dernierPost, erreur: err, cause: err ? causeMeta(err, muet) : null };
  };
  return { instagram: reseau('insta', 'instaErreur'), facebook: reseau('fb', 'fbErreur') };
}

// Telegram « Cerveau central » : seulement quand c'est à louis d'agir, une fois par réseau et par cause
// (`deja` garde ce qui a été envoyé ; un post réussi l'efface, la même panne plus tard re-prévient).
export function alertesTelegramReseaux(np, deja = {}, maintenant = new Date()) {
  const r = etatReseaux(np, maintenant);
  const messages = [];
  for (const [nom, x] of [['Instagram', r.instagram], ['Facebook', r.facebook]]) {
    if (!x.cause) {
      delete deja[nom];
      continue;
    }
    if (x.cause.qui !== 'louis' || deja[nom] === x.cause.id) continue;
    deja[nom] = x.cause.id;
    messages.push(`📵 <b>Nūr Meet · ${nom}</b> : ${x.cause.cause}${x.cause.codes ? ` (${x.cause.codes})` : ''}.\n👉 ${x.cause.faire}`);
  }
  return messages;
}

// Ce qui demande une action de louis, à afficher sur la carte Nūr Meet.
export function alertesNourPublic(np, maintenant = new Date()) {
  if (!np) return [];
  const aujourdhui = jourParis(maintenant);
  const alertes = [];
  const heures = (maintenant - new Date(np.maj)) / 3_600_000;
  if (heures > 26) alertes.push(`Le relevé grand public de Nūr Meet n'arrive plus depuis ${Math.floor(heures / 24)} jour(s) : vérifier le cron du VPS Nūr (scripts/nour-public-releve.sh).`);
  const r = etatReseaux(np, maintenant);
  for (const [nom, x] of [['Instagram', r.instagram], ['Facebook', r.facebook]]) {
    const muet = x.dernierPost ? joursEntre(x.dernierPost, aujourdhui) : null;
    const pourquoi = x.cause ? `${x.cause.cause}${x.cause.codes ? ` (${x.cause.codes})` : ''}, ${QUI[x.cause.qui]} : ${x.cause.faire}` : '';
    if (muet === null && np.posts.length) alertes.push(`${nom} : aucun post n'est passé.${pourquoi ? ` ${pourquoi}` : ''}`);
    else if (muet !== null && muet >= 2) alertes.push(`${nom} ne publie plus depuis ${muet} jours.${pourquoi ? ` ${pourquoi}` : ''}`);
  }
  // Étape 1 du tunnel (axes de louis du 20/10) : un visiteur qui repart après une seule page n'a sans
  // doute pas compris à quoi sert le site. Sous 20 % d'exploration sur un échantillon sérieux, la
  // loop doit revoir le message, voire poser à louis la question d'un pivot.
  const t = np.tunnel;
  if (t?.visiteurs >= 100 && t.explorent !== null && t.explorent / t.visiteurs < 0.2) alertes.push(`Seuls ${Math.round((100 * t.explorent) / t.visiteurs)} % des visiteurs vont au-delà de la première page (30 j) : le site est-il compris ?`);
  if (!np.soirees.some((s) => !s.demo)) alertes.push('Aucune vraie soirée à vendre aux particuliers : même un visiteur intéressé ne peut rien réserver.');
  return alertes;
}

const e = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (x) => (x === null || x === undefined ? 'indisponible' : Number(x).toLocaleString('fr-FR'));
const pct = (a, b) => (a === null || a === undefined || !b ? '' : ` <small>(${Math.round((100 * a) / b)} %)</small>`);
const date = (j) => (j ? `${j.slice(8, 10)}/${j.slice(5, 7)}` : 'jamais');

// Le bloc « Grand public » de la page projet Nūr Meet.
export function htmlNourPublic(np, maintenant = new Date()) {
  if (!np) return '';
  const aujourdhui = jourParis(maintenant);
  const il30 = jourParis(new Date(maintenant - 29 * 86_400_000));
  const il7 = jourParis(new Date(maintenant - 6 * 86_400_000));
  const posts30 = np.posts.filter((p) => p.jour >= il30);
  const mesures = posts30.filter((p) => p.portee !== null);
  const porteeMoy = mesures.length ? Math.round(mesures.reduce((a, p) => a + p.portee, 0) / mesures.length) : null;
  const r = etatReseaux(np, maintenant);
  // Tunnel en étapes (axes de louis du 20/10) : chaque étape avec sa part de l'étape précédente, pour
  // voir où le grand public décroche.
  const t = np.tunnel ?? {};
  const etapes = [
    ['Visiteurs', t.visiteurs],
    ['Vont au-delà de la 1re page', t.explorent],
    ['Ouvrent une soirée', t.soirees],
    ['Créent un compte', depuis(np.comptes, il30)],
    ['Candidatent', depuis(np.candidatures, il30)],
    ['Paient leur place', depuis(np.places, il30)],
  ];
  const tunnel = `<ul>${etapes.map(([nom, v], i) => `<li><span>${i + 1}. ${nom}</span><span class="num">${n(v)}${i ? pct(v, etapes[i - 1][1]) : ''}</span></li>`).join('')}</ul>`;
  const ligneReseau = (nom, x) => {
    const muet = x.dernierPost ? joursEntre(x.dernierPost, aujourdhui) : null;
    const etat = muet !== null && muet < 2 ? '🟢' : '🔴';
    const cause = x.cause ? `<br><small>Dernier essai refusé : <b>${e(x.cause.cause)}</b>${x.cause.codes ? ` (${e(x.cause.codes)})` : ''}, ${QUI[x.cause.qui]}. ${e(x.cause.faire)}<br>Meta : « ${e(x.erreur)} »</small>` : '';
    return `<li><span>${etat} ${nom} : dernier post ${date(x.dernierPost)}${cause}</span></li>`;
  };
  // Les derniers essais, réseau par réseau (✅ passé, ❌ refusé), pour voir d'un coup d'œil si ça dure.
  const essais = (ok) => np.posts.slice(-7).map((p) => `<span title="${e(p.jour)}">${p[ok] ? '✅' : '❌'}</span>`).join('');
  const vraies = np.soirees.filter((s) => !s.demo);
  const soirees = vraies.length
    ? `<ul>${vraies.map((s) => `<li><span>${e(s.titre)}${s.lieu ? `, ${e(s.lieu)}` : ''} <small>${e(s.quand ?? '')}</small></span><span class="num">${n(s.inscrits)} / ${n(s.places)}${s.minimum ? ` <small>(min. ${n(s.minimum)})</small>` : ''}</span></li>`).join('')}</ul>`
    : '<p class="vide">Aucune soirée réelle à venir.</p>';
  const origines = np.origines.length ? `<ul>${np.origines.map((o) => `<li><span>${e(o.source)}</span><span class="num">${n(o.n)}</span></li>`).join('')}</ul>` : '<p class="vide">Aucune visite enregistrée.</p>';
  return `<section class="bloc visites"><h3>Grand public <small>(networking et dating, relevé du site)</small></h3>
<div class="chiffres-v">
<div><b>${n(depuis(np.comptes, il7))}</b><span>comptes créés (7 j)</span></div>
<div><b>${n(depuis(np.comptes, il30))}</b><span>comptes créés (30 j)</span></div>
<div><b>${n(np.comptesTotal)}</b><span>comptes en tout</span></div>
<div><b>${n(depuis(np.candidatures, il30))}</b><span>candidatures (30 j)</span></div>
<div><b>${n(depuis(np.places, il30))}</b><span>places payées (30 j)</span></div>
<div><b>${n(porteeMoy)}</b><span>personnes touchées par post (30 j)</span></div>
</div>
<div class="listes-v">
<div class="liste-v"><b>Tunnel (30 j)</b>${tunnel}</div>
<div class="liste-v"><b>Réseaux</b><ul>${ligneReseau('Instagram', r.instagram)}${ligneReseau('Facebook', r.facebook)}</ul>${np.posts.length ? `<p class="vide">7 derniers jours : Instagram ${essais('insta')} · Facebook ${essais('fb')}</p>` : ''}</div>
<div class="liste-v"><b>Soirées à venir (inscrits / places)</b>${soirees}</div>
<div class="liste-v"><b>D’où viennent les visiteurs (30 j, avec accord cookies)</b>${origines}</div>
</div>
${np.lecons?.length ? `<h4>Ce que la loop a appris</h4><ul>${np.lecons.slice().reverse().map((l) => `<li>${e(l)}</li>`).join('')}</ul>` : ''}
<p class="vide">Lu dans la base du site Nūr Meet chaque heure (lecture seule). Dernier relevé : ${e(new Date(np.maj).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }))}.</p></section>`;
}
