// Les fiches d'action : un problème = une seule fiche, avec son constat, ses faits,
// sa discussion avec le cerveau et son statut. Le cerveau ouvre et met à jour les
// fiches d'après des événements réels ; seul louis peut marquer une fiche « Résolu ».
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { sauverEtat as sauverJson } from './etat.js';

export async function chargerActions(fichier) {
  try {
    const donnees = JSON.parse(await readFile(fichier, 'utf8'));
    for (const a of donnees.actions ?? []) a.statut = normaliserStatut(a.statut);
    return donnees;
  } catch (err) {
    if (err.code === 'ENOENT') return { actions: [] };
    throw err;
  }
}
export const sauverActions = sauverJson;

// Les quatre statuts choisis par louis le 11/10 (plus « reporté ») : à chaque
// étape, on sait qui a la main. Le cerveau ne pose jamais « resolu » lui-même.
export const STATUTS_ACTION = {
  question_posee: { nom: 'Question posée à Walid', qui: 'Une question précise attend ta réponse, dans la fiche.', a: 'toi' },
  reponse_a_analyser: { nom: 'Réponse du cerveau attendue', qui: 'Le cerveau doit analyser (ta réponse, ou le problème) : il le fait à son passage du matin, ou tout de suite si tu lui écris.', a: 'cerveau' },
  proposition_a_valider: { nom: 'Action proposée à Walid', qui: 'Une action concrète attend ta décision : oui, non, ou reporter.', a: 'toi' },
  reporte: { nom: 'Reporté', qui: 'Rien pour l’instant : la fiche revient à la date que tu as choisie.', a: 'personne' },
  resolu: { nom: 'Résolu', qui: 'Rien : tu l’as marqué résolu.', a: 'personne' },
};
export const STATUTS_OUVERTS = Object.keys(STATUTS_ACTION).filter((s) => s !== 'resolu');
// Les statuts où c'est à louis de jouer (compteur du menu, priorités du jour).
export const A_TOI = new Set(Object.entries(STATUTS_ACTION).filter(([, v]) => v.a === 'toi').map(([k]) => k));

// Les anciens statuts (avant le 11/10) se lisent encore et se ramènent aux nouveaux.
const ANCIENS = {
  a_analyser: 'reponse_a_analyser',
  analyse_en_cours: 'reponse_a_analyser',
  a_transmettre: 'proposition_a_valider',
  correction_en_cours: 'proposition_a_valider',
  resultat_a_verifier: 'proposition_a_valider',
};
export const normaliserStatut = (s) => (STATUTS_ACTION[s] ? s : (ANCIENS[s] ?? 'reponse_a_analyser'));

// Clé stable d'un problème : même texte aux nombres près = même fiche.
export const cleProbleme = (prefixe, texte) =>
  `${prefixe}:${createHash('sha256').update(String(texte).toLowerCase().replace(/[\d.,]+/g, 'n').replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 12)}`;

const evenement = (type, texte, quand) => ({ quand: quand ?? new Date().toISOString(), type, texte: String(texte).slice(0, 4000) });

export function trouverOuverte(donnees, cle) {
  return donnees.actions.find((a) => a.cle === cle && a.statut !== 'resolu');
}

// Ouvre une fiche, ou rattache l'occurrence à la fiche déjà ouverte pour ce problème.
export function ouvrirAction(donnees, { cle, projet, titre, constat, consequence = null, source = null }, maintenant = new Date()) {
  const quand = maintenant.toISOString();
  const existante = trouverOuverte(donnees, cle);
  if (existante) {
    if (constat && constat !== existante.constat) {
      existante.constat = String(constat).slice(0, 2000);
      existante.historique.push(evenement('occurrence', constat, quand));
      existante.historique = existante.historique.slice(-200);
      existante.maj = quand;
    }
    return existante;
  }
  const action = {
    id: randomBytes(5).toString('hex'),
    cle,
    projet: String(projet ?? ''),
    titre: String(titre).slice(0, 300),
    constat: String(constat ?? titre).slice(0, 2000),
    consequence: consequence ? String(consequence).slice(0, 2000) : null,
    source,
    statut: 'reponse_a_analyser',
    cree: quand,
    maj: quand,
    historique: [evenement('ouverture', constat ?? titre, quand)],
    discussion: [],
  };
  donnees.actions.unshift(action);
  donnees.actions = donnees.actions.slice(0, 300);
  return action;
}

// Seules les routes du site (donc louis) passent par ici ; le cerveau n'utilise
// jamais cette fonction pour poser « resolu » : lui ne pose que resultat_a_verifier.
export function changerStatutAction(donnees, id, statut, maintenant = new Date(), { jusquau = null } = {}) {
  if (!STATUTS_ACTION[statut]) return { erreur: 'Statut inconnu.' };
  const action = donnees.actions.find((a) => a.id === id);
  if (!action) return { erreur: 'Fiche introuvable.' };
  if (action.statut === statut && statut !== 'reporte') return { action };
  action.maj = maintenant.toISOString();
  if (statut === 'reporte') {
    // Reporté : la fiche se tait jusqu'à la date choisie (7 jours par défaut), puis revient où elle en était.
    const date = /^\d{4}-\d{2}-\d{2}$/.test(jusquau ?? '') ? jusquau : new Date(maintenant.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
    if (action.statut !== 'reporte') action.statutAvant = action.statut;
    action.reporteJusquau = date;
    action.statut = 'reporte';
    action.historique.push(evenement('statut', `Reportée par toi jusqu’au ${date}`, action.maj));
    return { action };
  }
  delete action.reporteJusquau;
  delete action.statutAvant;
  action.statut = statut;
  action.historique.push(evenement('statut', `Statut changé par toi : ${STATUTS_ACTION[statut].nom}`, action.maj));
  return { action };
}

// Les fiches reportées dont la date est passée reviennent où elles en étaient.
export function reveillerReportees(donnees, jour) {
  const revenues = [];
  for (const a of donnees.actions) {
    if (a.statut !== 'reporte' || !a.reporteJusquau || a.reporteJusquau > jour) continue;
    a.statut = normaliserStatut(a.statutAvant ?? 'proposition_a_valider');
    if (a.statut === 'reporte') a.statut = 'proposition_a_valider';
    delete a.reporteJusquau;
    delete a.statutAvant;
    a.maj = new Date().toISOString();
    a.historique.push(evenement('statut', `Report terminé : la fiche revient (${STATUTS_ACTION[a.statut].nom}).`, a.maj));
    revenues.push(a);
  }
  return revenues;
}

// Ajoute un échange (louis ou cerveau) à la discussion de la fiche.
export function ajouterEchangeAction(action, role, texte, maintenant = new Date()) {
  action.discussion.push({ role, texte: String(texte).slice(0, 8000), quand: maintenant.toISOString() });
  action.discussion = action.discussion.slice(-80);
  action.maj = maintenant.toISOString();
}

// Un message de louis + la réponse du cerveau, enregistrés sur la fiche.
// Ce que sa réponse change : la fiche passe « Réponse du cerveau attendue »,
// puis, si le cerveau a répondu, au statut que sa réponse appelle (`suite` :
// question → question posée, proposition → action proposée). Sans réponse
// (plafond, panne d'IA), elle reste en attente du cerveau.
export function enregistrerEchange(donnees, id, question, reponse, maintenant = new Date()) {
  const action = donnees.actions.find((a) => a.id === id);
  if (!action) return { erreur: 'Fiche introuvable.' };
  const avant = action.statut;
  const decision = avant === 'question_posee' || avant === 'proposition_a_valider';
  ajouterEchangeAction(action, 'louis', question, maintenant);
  action.historique.push(evenement(decision ? 'reponse' : 'note', question, maintenant.toISOString()));
  action.historique = action.historique.slice(-200);
  if (avant === 'reporte') {
    delete action.reporteJusquau;
    delete action.statutAvant;
  }
  action.statut = 'reponse_a_analyser';
  ajouterEchangeAction(action, 'cerveau', reponse.texte ?? reponse.erreur, maintenant);
  if (reponse.erreur) action.discussion.at(-1).erreur = true;
  else action.statut = reponse.suite === 'question' ? 'question_posee' : 'proposition_a_valider';
  if (action.statut !== avant) action.historique.push(evenement('statut', `Ta réponse a changé le statut : ${STATUTS_ACTION[action.statut].nom}`, maintenant.toISOString()));
  return { action, avant, apres: action.statut };
}

// Les connexions de revenus à préparer (chapitre 6 du document du 06/10).
// Chacune s'ouvre UNE fois : si louis résout la fiche, elle ne revient pas.
const REVENUS = [
  {
    cle: 'revenu:youtube',
    projet: 'YouTube (3 chaînes)',
    titre: 'Revenus YouTube / AdSense à brancher en priorité',
    constat: 'Le cerveau lit les statistiques publiques des chaînes YouTube (vues, abonnés) mais pas leurs revenus : la clé actuelle ne le permet pas.',
    consequence: 'Impossible de dire ce que les vidéos rapportent : les analyses restent aveugles sur l’argent qui rentre.',
    piste: 'Il faut autoriser l’accès « YouTube Analytics / AdSense » (connexion OAuth) avec le compte Google propriétaire des chaînes — une autorisation à donner une fois, pas de saisie répétée. Dis-le dans ton projet Claude quand tu veux le faire, c’est une étape guidée.',
  },
  {
    cle: 'revenu:tiktok',
    projet: 'TikTok',
    titre: 'Revenus TikTok : vérifier ce que ton compte permet',
    constat: 'TikTok n’offre pas d’accès automatique simple aux revenus des créateurs : ce que ton compte permet exactement reste à vérifier.',
    consequence: 'Tant que ce n’est pas vérifié, les revenus TikTok n’apparaissent nulle part dans le cerveau.',
    piste: 'Première étape : regarder dans ton espace créateur TikTok si un export ou une page « revenus » existe. Si aucun accès automatique n’est possible, on documente la limite réelle et on met en place un relevé mensuel assisté — jamais une saisie à répéter chaque jour.',
  },
  {
    cle: 'revenu:meta',
    projet: 'Facebook / Instagram',
    titre: 'Revenus Facebook et Instagram : vérifier ce que ton compte permet',
    constat: 'Les revenus de monétisation Facebook/Instagram demandent un accès Meta Business dont la disponibilité dépend de ton compte : à vérifier.',
    consequence: 'Les revenus (et même les vues) de Petites histoires vraies restent invisibles dans le cerveau.',
    piste: 'Première étape : vérifier dans Meta Business Suite ce que ton compte expose (monétisation, statistiques). L’accès aux vues par vidéo passe par la même autorisation : une pierre deux coups. Si l’accès n’existe pas, on documente la limite et on prévoit un relevé mensuel assisté.',
  },
];

// Met les fiches en face des signaux réels : pannes de la surveillance et
// questions « À décider » des cartes projet. Un signal disparu ne résout rien
// tout seul : la fiche passe en « Résultat à vérifier » et louis conclut.
export function synchroniserActions(donnees, { etat, cartes = [], config, configJournal }, maintenant = new Date()) {
  const quand = maintenant.toISOString();
  const nomSurveillance = (id) => config?.projets?.find((p) => p.id === id)?.nom ?? id;
  const nomBusiness = (id) => configJournal?.projets?.find((p) => p.id === id)?.nom ?? id;

  const signaux = [
    ...Object.entries(etat?.verifications ?? {})
      .filter(([, v]) => v.etat === 'panne')
      .map(([k, v]) => ({
        cle: `panne:${k}`,
        projet: nomSurveillance(v.projet),
        titre: v.sens ?? `${nomSurveillance(v.projet)} : ${v.nom}`,
        constat: `${v.sens ?? v.detail} (${v.nom} : ${v.detail})`,
        source: { type: 'surveillance', verification: k, depuis: v.depuis },
      })),
    ...cartes.flatMap((c) =>
      (c.aDecider ?? []).map((texte) => ({
        cle: cleProbleme(`decider:${c.id}`, texte),
        projet: nomBusiness(c.id),
        titre: texte,
        constat: texte,
        source: { type: 'decider', projet: c.id },
      })),
    ),
  ];

  for (const s of signaux) delete ouvrirAction(donnees, s, maintenant).retourAuVert;

  for (const r of REVENUS)
    if (!donnees.actions.some((a) => a.cle === r.cle)) {
      const action = ouvrirAction(donnees, { cle: r.cle, projet: r.projet, titre: r.titre, constat: r.constat, consequence: r.consequence, source: { type: 'revenu' } }, maintenant);
      ajouterEchangeAction(action, 'cerveau', r.piste, maintenant);
    }

  const vivantes = new Set(signaux.map((s) => s.cle));
  for (const a of donnees.actions) {
    if (a.statut === 'resolu' || a.statut === 'reporte' || a.retourAuVert || a.historique.at(-1)?.texte?.startsWith('Le signal est revenu au vert')) continue;
    if (!/^(panne:|decider:)/.test(a.cle) || vivantes.has(a.cle)) continue;
    // Le signal a disparu : le cerveau propose de clore, louis vérifie et marque résolu.
    a.statut = 'proposition_a_valider';
    a.retourAuVert = quand;
    a.maj = quand;
    a.historique.push(evenement('statut', 'Le signal est revenu au vert : vérifie que c’est bien réglé, puis marque la fiche résolue.', quand));
    ajouterEchangeAction(a, 'cerveau', 'Le signal est revenu au vert. Si tout est bon pour toi, marque la fiche résolue ; sinon dis-moi ce qui cloche encore.', maintenant);
  }
  reveillerReportees(donnees, quand.slice(0, 10));
  return donnees.actions;
}

// Le dossier que louis peut copier ou télécharger pour Claude : tout ce qui est su,
// faits datés et hypothèses séparés. Aucune clé ni secret n'est stocké dans les fiches.
export function dossierPourClaude(action) {
  const l = [];
  l.push(`# Dossier de correction — ${action.titre}`);
  l.push(`Projet : ${action.projet || 'cerveau central'} · fiche ouverte le ${action.cree.slice(0, 10)} · statut : ${STATUTS_ACTION[action.statut]?.nom ?? action.statut}`);
  l.push(`\n## Problème constaté\n${action.constat}`);
  if (action.consequence) l.push(`\n## Conséquence pour le projet\n${action.consequence}`);
  l.push(`\n## Résultat attendu\nLe problème ne se reproduit plus et louis peut le vérifier dans le cerveau (${action.source?.type === 'surveillance' ? 'la vérification repasse au vert' : 'le signal disparaît de la page Actions'}).`);
  const faits = action.historique.filter((h) => h.type === 'ouverture' || h.type === 'occurrence' || h.type === 'statut');
  l.push(`\n## Faits observés (datés)\n${faits.map((h) => `- ${h.quand.slice(0, 16).replace('T', ' ')} : ${h.texte}`).join('\n') || '- aucun'}`);
  const notes = action.historique.filter((h) => h.type === 'reponse' || h.type === 'note');
  if (notes.length) l.push(`\n## Réponses et notes de louis\n${notes.map((h) => `- ${h.quand.slice(0, 10)} : ${h.texte}`).join('\n')}`);
  if (action.discussion.length)
    l.push(`\n## Échanges avec le cerveau\n${action.discussion.map((m) => `**${m.role === 'louis' ? 'louis' : 'cerveau'}** (${m.quand.slice(0, 16).replace('T', ' ')}) : ${m.texte}`).join('\n\n')}`);
  l.push(`\n## Hypothèses restantes et contrôles à faire\n- Vérifier la cause exacte dans les journaux de la source concernée (${action.source?.type ?? 'voir constat'}).\n- Confirmer après correction que le signal du cerveau repasse au vert.`);
  l.push('\nNote : les clés et secrets ne font jamais partie de ce dossier ; ils restent dans le .env du serveur.');
  return l.join('\n');
}
