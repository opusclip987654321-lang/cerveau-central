// Choisir le mot de passe de la page. Sur le serveur :
//   read -rs -p "Mot de passe : " MDP; echo; printf '%s' "$MDP" | docker compose run --rm -T cerveau node src/mot-de-passe.js >> .env; unset MDP
// Le mot de passe est lu sur l'entrée standard (jamais affiché) et seule son empreinte
// est écrite, sous la forme MOT_DE_PASSE_EMPREINTE=… ; le mot de passe n'est enregistré nulle part.
import { empreinte } from './acces.js';

let mdp = '';
for await (const morceau of process.stdin) mdp += morceau;
mdp = mdp.replace(/\r?\n$/, '');

if (mdp.length < 12) {
  console.error('Trop court : choisis au moins 12 caractères. Rien n’a été écrit.');
  process.exit(1);
}
console.log(`MOT_DE_PASSE_EMPREINTE=${empreinte(mdp)}`);
