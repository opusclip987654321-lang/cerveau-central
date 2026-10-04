// Choisir le mot de passe de la page : `npm run mot-de-passe`.
// Affiche la ligne à copier dans .env ; le mot de passe lui-même n'est enregistré nulle part.
import { createInterface } from 'node:readline';
import { empreinte } from './acces.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
// Le mot de passe tapé ne s'affiche pas à l'écran.
let masque = false;
rl._writeToOutput = (texte) => process.stdout.write(masque ? (texte.includes('\n') ? '\n' : '') : texte);
const demander = (q) =>
  new Promise((r) => {
    masque = false;
    process.stdout.write(q);
    masque = true;
    rl.question('', (reponse) => {
      masque = false;
      process.stdout.write('\n');
      r(reponse);
    });
  });
const mdp = await demander('Nouveau mot de passe (12 caractères ou plus) : ');
if (mdp.length < 12) {
  console.error('Trop court : choisis au moins 12 caractères.');
  process.exit(1);
}
const encore = await demander('Encore une fois : ');
rl.close();
if (encore !== mdp) {
  console.error('Les deux ne sont pas pareils, recommence.');
  process.exit(1);
}
console.log(`\nCopie cette ligne dans .env :\nMOT_DE_PASSE_EMPREINTE=${empreinte(mdp)}\n`);
