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

// État de chaque réseau : dernier post réussi, et l'erreur du dernier essai s'il a échoué.
export function etatReseaux(np) {
  const posts = np?.posts ?? [];
  const reseau = (ok, erreur) => {
    const reussis = posts.filter((p) => p[ok]);
    const dernier = posts.at(-1);
    return { dernierPost: reussis.at(-1)?.jour ?? null, erreur: dernier && !dernier[ok] ? dernier[erreur] : null };
  };
  return { instagram: reseau('insta', 'instaErreur'), facebook: reseau('fb', 'fbErreur') };
}

// Ce qui demande une action de louis, à afficher sur la carte Nūr Meet.
export function alertesNourPublic(np, maintenant = new Date()) {
  if (!np) return [];
  const aujourdhui = jourParis(maintenant);
  const alertes = [];
  const heures = (maintenant - new Date(np.maj)) / 3_600_000;
  if (heures > 26) alertes.push(`Le relevé grand public de Nūr Meet n'arrive plus depuis ${Math.floor(heures / 24)} jour(s) : vérifier le cron du VPS Nūr (scripts/nour-public-releve.sh).`);
  const r = etatReseaux(np);
  for (const [nom, x] of [['Instagram', r.instagram], ['Facebook', r.facebook]]) {
    const muet = x.dernierPost ? joursEntre(x.dernierPost, aujourdhui) : null;
    if (muet === null && np.posts.length) alertes.push(`${nom} : aucun post n'est passé${x.erreur ? ` (« ${x.erreur} »)` : ''}.`);
    else if (muet !== null && muet >= 2) alertes.push(`${nom} ne publie plus depuis ${muet} jours${x.erreur ? ` : « ${x.erreur} »` : ''}.`);
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
  const r = etatReseaux(np);
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
    return `<li><span>${etat} ${nom} : dernier post ${date(x.dernierPost)}${x.erreur ? ` <small>(« ${e(x.erreur)} »)</small>` : ''}</span></li>`;
  };
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
<div class="liste-v"><b>Réseaux</b><ul>${ligneReseau('Instagram', r.instagram)}${ligneReseau('Facebook', r.facebook)}</ul></div>
<div class="liste-v"><b>Soirées à venir (inscrits / places)</b>${soirees}</div>
<div class="liste-v"><b>D’où viennent les visiteurs (30 j, avec accord cookies)</b>${origines}</div>
</div>
${np.lecons?.length ? `<h4>Ce que la loop a appris</h4><ul>${np.lecons.slice().reverse().map((l) => `<li>${e(l)}</li>`).join('')}</ul>` : ''}
<p class="vide">Lu dans la base du site Nūr Meet chaque heure (lecture seule). Dernier relevé : ${e(new Date(np.maj).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }))}.</p></section>`;
}
