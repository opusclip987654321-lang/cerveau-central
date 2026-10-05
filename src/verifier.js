// Lance toutes les vérifications, repère les changements et prévient louis.
import { verifierSite } from './checks/http.js';
import { verifierCertificat } from './checks/tls.js';
import { verifierDisque, verifierMemoire, verifierCharge } from './checks/serveur.js';
import { verifierN8n } from './checks/n8n.js';
import { verifierReleve } from './checks/releve.js';
import { chargerEtat, sauverEtat, changement } from './etat.js';
import { redigerAlerte } from './alertes.js';

const VERIFICATEURS = {
  site: verifierSite,
  certificat: verifierCertificat,
  disque: verifierDisque,
  memoire: verifierMemoire,
  charge: verifierCharge,
  n8n: verifierN8n,
  releve: verifierReleve,
};

export const cle = (projet, verif, i) => `${projet.id}/${verif.nom ?? verif.type}#${i}`;

export async function toutVerifier({ config, fichierEtat, envoyer, options = {} }) {
  const etat = await chargerEtat(fichierEtat);
  const maintenant = new Date().toISOString();
  const optionsPar = {
    n8n: options.n8n ?? {},
    site: options.site,
    certificat: options.certificat,
    releve: options.releve,
  };

  const taches = config.projets.flatMap((projet) =>
    projet.verifications.map(async (verif, i) => {
      if (verif.type === 'n8n') verif = { nom: 'Exécutions en erreur', ...verif };
      const fn = VERIFICATEURS[verif.type];
      let resultat;
      try {
        // Plusieurs n8n possibles : la vérification nomme son instance (« principal » par défaut).
        const opts = verif.type === 'n8n' ? { ...optionsPar.n8n[verif.instance ?? 'principal'], depuis: etat.derniereVerification } : optionsPar[verif.type];
        resultat = fn ? await fn(verif, config.seuils, opts) : { etat: 'ignore', detail: `type inconnu : ${verif.type}` };
      } catch (err) {
        resultat = { etat: 'panne', detail: `vérification impossible (${err.message})` };
      }
      if (verif.type === 'n8n' && resultat.etat !== 'panne' && resultat.etat !== 'ignore') resultat.evenement = true;
      return { projet, verif, cle: cle(projet, verif, i), resultat };
    }),
  );
  const resultats = await Promise.all(taches);

  const messages = [];
  for (const { projet, verif, cle: k, resultat } of resultats) {
    const avant = etat.verifications[k];
    const type = changement(avant, resultat);
    if (type) {
      messages.push(redigerAlerte(type, projet, verif, resultat, avant));
      etat.historique.unshift({ date: maintenant, projet: projet.nom, verification: verif.nom, type, detail: resultat.detail });
    }
    const memeEtat = avant && avant.etat === resultat.etat;
    etat.verifications[k] = {
      projet: projet.id,
      nom: verif.nom,
      etat: resultat.etat,
      detail: resultat.detail,
      ms: resultat.ms,
      verifie: maintenant,
      depuis: memeEtat ? avant.depuis : maintenant,
    };
  }
  // On ne garde que les vérifications encore présentes dans la configuration.
  const actuelles = new Set(resultats.map((r) => r.cle));
  for (const k of Object.keys(etat.verifications)) if (!actuelles.has(k)) delete etat.verifications[k];
  etat.historique = etat.historique.slice(0, 200);
  etat.derniereVerification = maintenant;
  await sauverEtat(fichierEtat, etat);

  if (messages.length && envoyer) {
    try {
      await envoyer(messages.join('\n\n'));
    } catch (err) {
      console.error(`Envoi Telegram impossible : ${err.message}`);
    }
  }
  return { etat, messages };
}
