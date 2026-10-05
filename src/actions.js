// Les fiches d'action : un problème = une seule fiche, avec son constat, ses faits,
// sa discussion avec le cerveau et son statut. Le cerveau ouvre et met à jour les
// fiches d'après des événements réels ; seul louis peut marquer une fiche « Résolu ».
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { sauverEtat as sauverJson } from './etat.js';

export async function chargerActions(fichier) {
  try {
    return JSON.parse(await readFile(fichier, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { actions: [] };
    throw err;
  }
}
export const sauverActions = sauverJson;

// Qui doit agir à chaque étape (tableau validé par louis dans son document du 06/10).
export const STATUTS_ACTION = {
  a_analyser: { nom: 'À analyser', qui: 'Le diagnostic n’a pas encore commencé.' },
  analyse_en_cours: { nom: 'Analyse du cerveau en cours', qui: 'Le cerveau examine les données disponibles.' },
  question_posee: { nom: 'Question posée', qui: 'Une question précise attend ta réponse.' },
  reponse_a_analyser: { nom: 'Réponse du cerveau attendue', qui: 'Ta réponse est enregistrée, le cerveau doit l’analyser.' },
  proposition_a_valider: { nom: 'Proposition à valider', qui: 'Une solution concrète attend ta décision.' },
  a_transmettre: { nom: 'À transmettre à Claude', qui: 'Le dossier de correction est prêt (bouton « Préparer pour Claude »).' },
  correction_en_cours: { nom: 'Correction en cours', qui: 'Une intervention confirmée est en cours.' },
  resultat_a_verifier: { nom: 'Résultat à vérifier', qui: 'La correction ou le retour au vert doit être contrôlé par toi.' },
  resolu: { nom: 'Résolu', qui: 'Rien : tu l’as marqué résolu.' },
};
export const STATUTS_OUVERTS = Object.keys(STATUTS_ACTION).filter((s) => s !== 'resolu');

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
    statut: 'a_analyser',
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
export function changerStatutAction(donnees, id, statut, maintenant = new Date()) {
  if (!STATUTS_ACTION[statut]) return { erreur: 'Statut inconnu.' };
  const action = donnees.actions.find((a) => a.id === id);
  if (!action) return { erreur: 'Fiche introuvable.' };
  if (action.statut === statut) return { action };
  action.statut = statut;
  action.maj = maintenant.toISOString();
  action.historique.push(evenement('statut', `Statut changé par toi : ${STATUTS_ACTION[statut].nom}`, action.maj));
  return { action };
}

// Ajoute un échange (louis ou cerveau) à la discussion de la fiche.
export function ajouterEchangeAction(action, role, texte, maintenant = new Date()) {
  action.discussion.push({ role, texte: String(texte).slice(0, 8000), quand: maintenant.toISOString() });
  action.discussion = action.discussion.slice(-80);
  action.maj = maintenant.toISOString();
}

// Un message de louis + la réponse du cerveau, enregistrés sur la fiche.
// Si une question lui était posée, sa réponse fait passer la fiche en
// « Réponse du cerveau attendue » : un événement réel, pas une supposition.
export function enregistrerEchange(donnees, id, question, reponse, maintenant = new Date()) {
  const action = donnees.actions.find((a) => a.id === id);
  if (!action) return { erreur: 'Fiche introuvable.' };
  const decision = action.statut === 'question_posee' || action.statut === 'proposition_a_valider';
  ajouterEchangeAction(action, 'louis', question, maintenant);
  action.historique.push(evenement(decision ? 'reponse' : 'note', question, maintenant.toISOString()));
  action.historique = action.historique.slice(-200);
  if (action.statut === 'question_posee') action.statut = 'reponse_a_analyser';
  ajouterEchangeAction(action, 'cerveau', reponse.texte ?? reponse.erreur, maintenant);
  if (reponse.erreur) action.discussion.at(-1).erreur = true;
  return { action };
}

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

  for (const s of signaux) ouvrirAction(donnees, s, maintenant);

  const vivantes = new Set(signaux.map((s) => s.cle));
  for (const a of donnees.actions) {
    if (a.statut === 'resolu' || a.statut === 'resultat_a_verifier') continue;
    if (!/^(panne:|decider:)/.test(a.cle) || vivantes.has(a.cle)) continue;
    a.statut = 'resultat_a_verifier';
    a.maj = quand;
    a.historique.push(evenement('statut', 'Le signal est revenu au vert : vérifie que c’est bien réglé, puis marque la fiche résolue.', quand));
  }
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
