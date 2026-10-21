# Cerveau central

Surveille les projets de louis, note quand quelque chose casse, et lui montre chaque matin où en sont ses projets (page « Aujourd'hui » : priorités du jour, une ligne par projet, ce qui a changé depuis hier). La surveillance technique est sur `/surveillance`.

C'est l'**étape 2** du cahier des charges : « Est-ce que tout tourne ? ». Le cerveau **ne corrige rien** : il observe et prévient.

## Ce qu'il fait

- Vérifie toutes les 3 heures que tout tourne. Les pannes sont notées sur les pages Aujourd'hui et Surveillance, plus envoyées sur Telegram depuis le 13/10 (louis n'y peut rien ; Telegram ne garde que ce qui lui demande une action).
- Envoie chaque matin un résumé sur Telegram : pannes en cours, incidents des dernières 24 h, projets à relancer, renouvellements à venir ; le 1er du mois, le total des dépenses du mois fini.
- Pose 3 questions par jour et par projet sur la page.

## Ce qu'il vérifie

| Projet | Vérifications |
|---|---|
| Nūr Meet | le site répond, l'API et sa base de données répondent (`/health/ready`), certificats HTTPS |
| Leviaro | le site et l'admin répondent, certificats HTTPS |
| VégéBudget | le site vegebudget.fr répond, certificat HTTPS |
| n8n | n8n répond (`/healthz`), certificat, et (avec une clé API en lecture) les exécutions tombées en erreur, avec le nom de l'automatisation |
| Serveur OVH | espace disque, mémoire, charge du processeur |

La liste se modifie dans [`config/surveillance.json`](config/surveillance.json), sans toucher au code.

Règles des alertes :

- 🔴 **panne** : le site ne répond pas, répond une erreur, certificat expiré ou à moins de 3 jours, disque plein à 95 %.
- 🟠 **à surveiller** : site lent (plus de 4 s), certificat à moins de 14 jours, disque à 85 %, mémoire à 90 %, nouvelles erreurs n8n.
- 🟢 **rétabli** : avec la durée de la panne.
- Un site qui rate une fois est revérifié 30 secondes plus tard avant d'alerter (pas de fausse alerte pour un raté passager).
- Une seule alerte par panne : pas de répétition tant qu'elle dure.

## Analyse du matin et fiches d'action

Chaque matin vers 7 h (`MATIN_HEURE`), le cerveau lit les chiffres de la veille projet par projet et écrit, pour chacun, une phrase qui challenge (page **Aujourd'hui**), ouvre au besoin une fiche d'action (une question, ou une action proposée) et répond aux fiches où louis a écrit. Un message Telegram reprend ces lignes. Budget à part (`PLAFOND_MATIN_DOLLARS`, 5 $ par mois par défaut), affiché dans Argent ; rien ne se change tout seul.

Une fiche d'action a quatre statuts, plus « reporté » : **Question posée à Walid** (une précision attendue), **Réponse du cerveau attendue** (le cerveau doit analyser, à son passage du matin ou tout de suite quand louis lui écrit dans la fiche), **Action proposée à Walid** (une action concrète à valider, ou la fiche à clore quand le signal est revenu au vert), **Résolu** (seul louis le pose). **Reporté** fait taire la fiche jusqu'à une date, puis elle revient où elle en était. Dans la fiche, la réponse de louis change le statut tout de suite : le cerveau répond et dit ce qu'il attend ensuite.

Les anciennes « Questions du jour » (3 questions par projet, `config/questions.json`) ne sont plus proposées depuis le 11/10 : la page `/questions` reste lisible pour l'historique.

## Visites des sites (Umami)

Le cerveau lit chez Umami (compteur gratuit installé sur le VPS Nūr, voir [`docs/visites-umami.md`](docs/visites-umami.md)) les visites de Nūr Meet, Leviaro et VégéBudget sur 30 jours : visiteurs, visites, pages vues, rebonds, temps par visite, pages les plus vues, provenance. Les sites sont retrouvés par leur domaine (`config/visites.json`) ; accès par `UMAMI_URL` + `UMAMI_UTILISATEUR` / `UMAMI_MOT_DE_PASSE` (ou `UMAMI_CLE_API`). Le bloc « Visites du site » apparaît dans la vue d'ensemble de chaque projet concerné ; un site absent d'Umami est dit tel quel.

## Connexions et Surveillance

La page **Connexions** montre d'où viennent les chiffres : une fiche par source (n8n, prospection, agent Leviaro, Sheet Impacteur, YouTube, revenus YouTube, Stripe, Gmail Cambodge, boîtes Gmail de louis, VégéBudget, histoires, relevé des serveurs) avec son état (branchée, silencieuse, en erreur, pas branchée), sa dernière lecture et ce qu'il faut pour la brancher (le nom de la variable du .env, jamais sa valeur). Le serveur note chaque tentative de lecture dans `data/business.json` (`connexions`). Ce qui reste à brancher est listé en bas.

**Mails à traiter** (page Aujourd'hui) : chaque heure, le cerveau appelle le workflow n8n « CERVEAU - lecture des boîtes » (créé par `scripts/boites-n8n.py`, lecture seule) qui renvoie les mails des 3 derniers jours de 6 boîtes Gmail (opusclip987654321, walidvideos12, impacteurmedia, gougamwalid, impacteurfrexit, impacteurafrique), hors promotions, réseaux sociaux et forums. `src/boites.js` les trie par règles, sans IA : **urgent** = compte ou paiement en danger (alerte de sécurité, compte suspendu, paiement refusé, avertissement…) ou une personne qui parle argent, contrat ou rendez-vous ; **à traiter** = une personne a écrit, mail pas encore lu ; le reste est ignoré. Chaque nouveau mail urgent part une fois sur Telegram (un message groupé par passage). Une boîte qui ne répond pas se voit dans Connexions sans cacher les autres.

La page **Surveillance** met d'abord ce qui est en panne, en mots simples (ce que ça veut dire pour le projet, depuis quand, la fiche d'action, et le schéma du parcours avec l'étape bloquée quand le contrôle la désigne) ; le détail des contrôles au vert est replié.

## Journal

L'onglet **Journal** montre, jour par jour et projet par projet, ce qui a été fait : vidéos publiées (avec leur lien), mails envoyés, rendez-vous, notes… et un bilan des 7 derniers jours. Chaque matin, le résumé Telegram ajoute « Hier, projet par projet ».

Trois sources :
- **n8n, automatiquement** : avec `N8N_API_KEY`, le cerveau compte chaque heure les exécutions réussies et en erreur de chaque automatisation, rangées par projet d'après leur nom (`config/journal.json`).
- **n8n, précisément** : en fin de workflow, un nœud *HTTP Request* envoie ce qui a été produit :
  - méthode `POST`, adresse `https://cerveau.nourmeet.com/api/journal` (ou `http://cerveau-central:8090/api/journal` depuis le réseau Docker)
  - en-tête `Authorization: Bearer <RELEVE_JETON>`
  - corps JSON : `{"projet": "extrait-politique", "type": "video", "titre": "…", "lien": "https://youtu.be/…", "details": "…"}` (ou une liste de ces objets)
  - projets : `nour-meet`, `leviaro`, `extrait-politique`, `histoires-vraies`, `impacteur`, `cambodge`, `autre` ; types : `video`, `publication`, `mail`, `rdv`, `client`, `note`, `autre`
- **À la main** : « Ajouter une note » sur la page.

## Commandes lancées sur le serveur (sorties)

Toute commande donnée par un fil Claude se lance à travers `scripts/envoyer.sh` : elle s'affiche à l'écran comme d'habitude, puis sa sortie part au cerveau. Le fil la relit lui-même ; plus rien à coller.

```sh
~/cerveau-central/scripts/envoyer.sh python3 scripts/nour-meet-etat.py
~/cerveau-central/scripts/envoyer.sh "docker ps | grep cerveau"          # une ligne de shell : entre guillemets
~/cerveau-central/scripts/envoyer.sh -n verif-caddy "docker logs caddy --tail 50"
```

- La commande tourne depuis `~/cerveau-central` ; le code de retour est rendu tel quel. Seul `RELEVE_JETON` est lu dans `.env` (sinon dans `~/.cerveau-releve` sur un autre serveur) ; envoi à `http://127.0.0.1:8090` (`CERVEAU_URL` pour changer).
- `POST /api/sorties` (jeton des relevés) : lignes `script:`, `commande:`, `code:`, `debut:`, `fin:`, `serveur:`, une ligne vide, puis la sortie. Avant d'être gardée, la sortie est passée au crible : toute valeur du `.env` à l'allure de secret, les `CLE=…`, `Bearer …`, clés `sk-…`, `ghp_…`, jetons de bot Telegram, mots de passe dans les adresses sont remplacés par `[masqué]`. 100 sorties gardées (`data/sorties.json`), 400 000 caractères chacune au plus (début et fin gardés).
- `GET /api/sorties` (jeton ou mot de passe) : `{"sorties": [...]}` de la plus récente à la plus ancienne ; filtres `?script=` (morceau du nom), `?depuis=` (date ISO), `?n=` (10 par défaut), `?id=`.

## Loops sur l'abonnement Claude (20/10)

L'IA des loops tourne dans des tâches programmées Claude (abonnement de louis), plus par l'API Anthropic. Elles passent par l'API du cerveau avec la **clé des loops** : `sha256("loops-abonnement:" + RELEVE_JETON)`, 40 premiers caractères (`src/cle-loops.js`, affichée sur le VPS par `scripts/cle-loops.sh`). Elle n'ouvre que `/api/loop/*` et la lecture de `/api/code`, `/api/decisions`, `/api/sorties`.

- `GET /api/loop/nour-meet/tri` : `{consigne, types, reponses: [{cle, objet, texte}]}` (60 au plus). `POST` du même chemin : `{"reponses": [{cle, type, resume}]}` ; un intéressé ou une question de moins de 7 jours = message Telegram.
- `GET /api/loop/nour-meet/revue` : `{semaine, consigne, donnees}` ; `semaine` vaut `null` s'il n'y a pas de revue due (lundi après 9 h, version de 6 jours au moins). `POST` : `{"semaine": "AAAA-MM-JJ", "revue": {…le JSON de la consigne…}}`, appliqué avec les mêmes garde-fous (méthode vérifiée, radical en attente de louis, leçons notées).
- `LOOP_NOUR_IA=api` dans `.env` remet l'ancien fonctionnement (Haiku toutes les 10 min, Opus le lundi, plafond `PLAFOND_LOOP_NOUR_DOLLARS`).

## Notion : tableau de bord des loops (21/10)

La page Notion « Loops des projets » est un tableau de bord : la table « 🧠 Mes projets » (une ligne par loop, `src/tableau-notion.js`) ouvre la page complète de chaque projet (objectif, où on en est, pistes, leçons, décisions filtrées, ancien contenu replié). Les règles communes sont sur la page « Règles des loops ».

- Toutes les 10 min, juste après la recopie des décisions, le cerveau réécrit dans chaque ligne (repérée par sa colonne `Clé` : `nour-restos`, `nour-grand-public`, `vegebudget`, `petites-histoires`, `impacteur`, `impacteur-sponsors`, `leviaro`) le chiffre principal, le chiffre secondaire, l'état, la dernière décision et l'heure. L'objectif et la page restent écrits à la main.
- Chiffres : restos payants (Stripe) et intéressés/contactés ; comptes particuliers et visites Umami sur 7 j ; abonnés payants VégéBudget, inscrits et visiteurs sur 30 j ; abonnés YouTube et heures (compte rendu de la loop PHV) ; oui interview, livres acceptés et invitations sur 7 j ; réponses et mails Leviaro. Impacteur Sponsors vit sur son serveur : chiffres « indisponible ». Donnée absente = « indisponible », jamais 0.
- Dernière décision : la plus récente de la table « Décisions des loops » pour cette loop (y compris ce qu'y écrivent les autres projets Claude).
- État : « Bloqué » si une alerte est levée (grand public, compte rendu PHV de plus de 9 jours) ; « Pas démarré » sans chiffre ni décision ; « En attente » pour une loop sans chiffre qui n'a rien décidé depuis 7 jours ; sinon « Tourne ».
- Même `NOTION_TOKEN` que les décisions (l'intégration est reliée à « Loops des projets ») ; `NOTION_PROJETS_SOURCE` pour changer de table.

## Argent

L'onglet **Argent** liste les abonnements et recharges (pré-remplis avec le récap du 05/10/2026, dans `config/argent.json`, puis modifiables depuis la page) : total du mois, coût fixe, répartition par projet, rappel Telegram 3 jours avant un renouvellement quand sa date est connue.

On peut y **déposer ses factures** (PDF ou photo). Si `ANTHROPIC_API_KEY` est dans `.env`, le cerveau les lit avec Claude Sonnet 5.5 (environ 1 centime par facture), les rapproche de la liste et montre ce qui est à jour, ce qui manque et les montants différents. La dépense IA est plafonnée par mois (`PLAFOND_IA_DOLLARS`, 10 $ par défaut). Les factures restent sur le serveur, dans le volume `data/factures`.

## Serveurs

L'onglet **Serveurs** montre chaque VPS (liste dans `config/serveurs.json`) : place sur le disque, mémoire, processeur, quels projets tournent dessus et ce qu'ils prennent, la date estimée où le disque sera plein, et des conseils (nettoyage possible, conteneur arrêté, déplacer un projet vers le VPS le moins rempli). Le cerveau ne touche à rien : il propose, louis décide.

Chaque VPS envoie un relevé par heure avec `scripts/releve.sh` (lecture seule : `df`, `docker ps`, `docker stats`, `du`). Installation, une fois par VPS :

```sh
# 1. Sur le VPS Nūr, une seule fois : créer le jeton et l'ajouter au .env du cerveau
cd ~/cerveau-central && echo "RELEVE_JETON=$(openssl rand -hex 24)" >> .env && docker compose up -d --build

# 2. Sur chaque VPS : réglages (SERVEUR = vps-nour ou vps-youtube ; même jeton qu'au 1.)
#    sur le VPS Nūr, CERVEAU_URL peut être http://127.0.0.1:8090
mkdir -p ~/cerveau-releve && curl -fsSL https://raw.githubusercontent.com/opusclip987654321-lang/cerveau-central/main/scripts/releve.sh -o ~/cerveau-releve/releve.sh && chmod +x ~/cerveau-releve/releve.sh
nano ~/.cerveau-releve && chmod 600 ~/.cerveau-releve

# 3. Tester, puis lancer chaque heure
~/cerveau-releve/releve.sh
(crontab -l 2>/dev/null; echo "7 * * * * $HOME/cerveau-releve/releve.sh >/dev/null 2>&1") | crontab -
```

Si un VPS n'envoie plus rien pendant 3 h, la panne s'affiche sur la page Surveillance (pas de Telegram depuis le 13/10).

## Règles des serveurs (pour tous les projets)

Plusieurs projets partagent le VPS Nūr. Pour qu'aucun n'en casse un autre :

- **Les sites déployés depuis un dépôt git ne se modifient jamais à la main sur le serveur.** Une modification locale bloque leur `git pull` et se perd à la mise à jour suivante. Pour changer un site, on passe par son dépôt (pull request), puis on met à jour avec sa commande habituelle. Si le changement concerne le site d'un autre projet, on le demande dans ce projet-là.
- Qui gère quoi :

| Site | Dossier sur le VPS Nūr | Dépôt | Mise à jour |
|---|---|---|---|
| VégéBudget | `/opt/vegebudget` | `v-g-budget` | `cd /opt/vegebudget && git pull && docker compose up -d --build` |
| Cerveau | `~/cerveau-central` | `cerveau-central` | `cd ~/cerveau-central && git pull && docker compose up -d --build` |
| Nūr Meet | `~/nour-v2` | `nour-meet` | toujours avec `-f docker-compose.prod.yml` (voir docs/visites-umami.md) |

- Si un `git pull` refuse à cause de « local changes », ne pas forcer : afficher la différence (`git diff`) et la donner au projet du site, qui la remet dans son dépôt avant la mise à jour.

## Installer sur le VPS

Prérequis : Docker (déjà présent sur le serveur).

```bash
git clone https://github.com/opusclip987654321-lang/cerveau-central.git /opt/cerveau-central
cd /opt/cerveau-central
cp .env.example .env
nano .env          # remplir le bot Telegram (voir plus bas), puis enregistrer
chmod 600 .env     # lisible seulement par root
docker compose up -d --build
docker compose logs -f   # doit afficher « vérification terminée »
```

Les clés restent dans `.env` sur le serveur. Ce fichier n'est **jamais** envoyé sur GitHub (il est dans `.gitignore`).

Mettre à jour plus tard :

```bash
cd /opt/cerveau-central && git pull && docker compose up -d --build
```

## Ouvrir la page depuis ton Mac

La page s'ouvre sur **https://cerveau.nourmeet.com**, protégée par un mot de passe. Après 5 mauvais essais, l'adresse est bloquée 15 minutes. Une fois connecté, le navigateur s'en souvient 30 jours.

1. **Choisir le mot de passe** (12 caractères ou plus), sur le serveur :
   ```bash
   read -rs -p "Mot de passe : " MDP; echo; printf '%s' "$MDP" | docker compose run --rm -T cerveau node src/mot-de-passe.js >> .env; unset MDP
   docker compose up -d
   ```
   Le mot de passe ne s'affiche pas et n'est enregistré nulle part : seule son empreinte (`MOT_DE_PASSE_EMPREINTE=…`) est ajoutée à `.env`. Pour en changer, supprimer cette ligne de `.env` et recommencer.
2. **Nom de domaine** : chez OVH, ajouter un enregistrement `A` pour `cerveau.nourmeet.com` vers l'adresse IP du serveur (la même que `n8n.nourmeet.com`).
3. **Réseau de Caddy** : `docker network ls`, repérer le réseau du projet nour-meet (souvent `nour-meet_default`) et le mettre dans `RESEAU_CADDY` dans `.env`.
4. **Caddy** : ajouter ce bloc au `Caddyfile` (dépôt nour-meet, `infra/Caddyfile`), puis recharger Caddy :
   ```
   cerveau.nourmeet.com {
   	reverse_proxy cerveau-central:8090
   }
   ```
5. `docker compose up -d --build`

Sans `MOT_DE_PASSE_EMPREINTE`, la page n'a pas de mot de passe : ne pas ajouter le bloc Caddy dans ce cas, et l'ouvrir seulement par tunnel SSH :

```bash
ssh -L 8090:127.0.0.1:8090 utilisateur@ip-du-vps
```

puis <http://localhost:8090>.

## Brancher Telegram

Les alertes passent par le bot du récap hebdo.

1. `TELEGRAM_BOT_TOKEN` : le jeton du bot, donné par @BotFather (`/mybots` → le bot → *API Token*).
2. `TELEGRAM_CHAT_ID` : envoyer un message au bot, puis ouvrir `https://api.telegram.org/bot<JETON>/getUpdates` ; le chiffre après `"chat":{"id":` est l'identifiant.

Sans ces deux valeurs, le cerveau tourne quand même et écrit les alertes dans ses journaux.

## Brancher n8n (facultatif)

Dans n8n : *Settings → n8n API → Create an API key*, puis la mettre dans `N8N_API_KEY`. Le 2ᵉ n8n (n8n.actualitevideo.fr, VPS YouTube) se branche de la même façon avec `N8N_ACTUALITE_API_KEY`. Le cerveau ne fait que **lire** la liste des automatisations et des exécutions en erreur.

## Sauvegarde des automatisations n8n

Chaque nuit à 3 h 30, `scripts/sauvegarde-n8n.py` copie toutes les automatisations des deux n8n (n8n.nourmeet.com et n8n.actualitevideo.fr) dans le dépôt GitHub `sauvegarde-n8n`, un fichier par automatisation. Seuls les changements sont enregistrés, donc on peut retrouver n'importe quelle automatisation telle qu'elle était à une date passée. Lecture seule côté n8n. Le dépôt étant public, une clé écrite en clair dans un nœud est remplacée par « à ressaisir », les adresses e-mail de prospects sont retirées (seules restent celles de nourmeet.com, leviaro.fr, actualitevideo.fr), et les données d'essai (pinData) ne sont pas copiées. Si la sauvegarde échoue, l'erreur reste dans le log du cron (plus de Telegram depuis le 13/10).

Installation, une fois, sur le VPS Nūr (il utilise les clés n8n du `.env` du cerveau) :

```sh
# 1. Sur GitHub : créer un dépôt vide nommé sauvegarde-n8n (sans README).
# 2. Créer la clé d'envoi du serveur et l'afficher
ssh-keygen -t ed25519 -N "" -C sauvegarde-n8n -f ~/.ssh/sauvegarde_n8n && cat ~/.ssh/sauvegarde_n8n.pub
# 3. Sur GitHub : sauvegarde-n8n > Settings > Deploy keys > Add deploy key, coller la clé, cocher « Allow write access ».
# 4. Récupérer le dépôt sur le serveur
GIT_SSH_COMMAND="ssh -i ~/.ssh/sauvegarde_n8n -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" git clone git@github.com:opusclip987654321-lang/sauvegarde-n8n.git ~/sauvegarde-n8n && git -C ~/sauvegarde-n8n config core.sshCommand "ssh -i ~/.ssh/sauvegarde_n8n -o IdentitiesOnly=yes" && git -C ~/sauvegarde-n8n config user.name "Sauvegarde n8n" && git -C ~/sauvegarde-n8n config user.email "sauvegarde@nourmeet.com"
# 5. Première sauvegarde, puis chaque nuit
python3 ~/cerveau-central/scripts/sauvegarde-n8n.py
(crontab -l 2>/dev/null; echo "30 3 * * * python3 $HOME/cerveau-central/scripts/sauvegarde-n8n.py >> $HOME/sauvegarde-n8n.log 2>&1") | crontab -
```

Restaurer une automatisation : sur GitHub, ouvrir le fichier (bouton *History* pour une version plus ancienne), *Download raw file*, puis dans n8n *Import from file*. Les accès (Gmail, Telegram…) se rebranchent par leur nom ; ceux qui ont disparu avec un serveur sont à recréer.

## Si le serveur lui-même tombe

Le cerveau tourne sur le serveur qu'il surveille : si le serveur tombe, il ne peut plus prévenir. Pour ça, ajouter un veilleur externe gratuit (par exemple UptimeRobot) qui vérifie `https://nourmeet.com` et `https://leviaro.fr` toutes les 5 minutes et prévient par mail ou Telegram.

## Tester sur sa machine

```bash
npm test               # les tests (Node 22, aucune dépendance)
npm run verifier       # une vérification complète, résultat dans le terminal
npm start              # la page d'état sur http://127.0.0.1:8090
```

## Pause / Reprendre, et Discuter

- **Pause** (onglet État, « Tes projets ») : le cerveau désactive dans n8n les automatisations actives du projet, et retient lesquelles. **Reprendre** réactive exactement celles-là. Ce qui tourne hors n8n (conteneurs Leviaro, agent vidéo Nūr Meet, chaîne Petites histoires vraies fabriquée dans le projet Claude « 3_PETITES HISTOIRES ») n'est pas touché.
- **Discuter** (sur chaque fiche d'action) : louis pose une question, Claude (Sonnet) répond à partir des données du cerveau (état, argent, journal, serveurs). Il ne modifie rien. Depuis le 19/10 (choix de louis), il peut aussi chercher sur internet quand la question porte sur un fait extérieur (un outil, un prix, une entreprise) : 3 recherches au plus par réponse, les pages utilisées s'affichent en liens sous « Sources (web) ». Une recherche coûte 1 centime plus la lecture des pages ; tout compte dans le plafond `PLAFOND_IA_DOLLARS` et la dépense IA de la page Argent. Si l'API refuse la recherche, la réponse part sans internet.

## Tableau de bord business (onglet Journal)

En tête du Journal : une carte par projet avec sa pastille (🟢 ça avance, 🟠 souci ou objectif pas atteint, 🔴 plus rien depuis trop longtemps, ⚪ pas encore branché), les chiffres de la période (7 ou 30 jours), un graphique par jour, ce qu'il y a « à décider » et un objectif hebdomadaire proposé que louis valide d'un clic. Le détail technique des automatisations est replié en bas.

- Leviaro : le cerveau copie chaque heure `leviaro.db` (dossier data de leviaro-agent, monté en lecture seule) et lit les mails envoyés, réponses, entreprises trouvées, validations en attente.
- Prospection Nūr Meet : lue chaque heure dans les tableaux de données n8n `np_prospects`, `np_envois`, `np_ouvertures` (API publique, clé `N8N_API_KEY`, lecture seule). Copie dans `data/business.json`.
- L'extrait politique : vidéos, vues et abonnés lus sur YouTube quand `YOUTUBE_API_KEY` (clé API YouTube Data v3) est dans le .env et que `config/youtube.json` liste les chaînes ; sinon, exécutions des automatisations « publi » de n8n.
- Le matin, Telegram signale les projets en rouge (`joursMax` par projet dans `config/journal.json`).

## Pages par projet et idées

Chaque carte du tableau de bord mène à `/projet?projet=<id>` : la carte business du projet, puis son détail (Nūr Meet : réponses, mails à valider, derniers mails ; Leviaro : réponses avec extrait, mails, entreprises et où ça en est ; Impacteur : invités avec auteur/livre/état ; Petites histoires vraies : vidéos de la chaîne YouTube et bloc « Loop de la chaîne », lu dans `config/loops/petites-histoires.json` que la loop du projet « 3_PETITES HISTOIRES » met à jour par PR), les notes du journal et la surveillance technique repliée. En haut, « Mes idées de modifications » : louis note ses idées, chacune suivie (proposée, en cours, faite, écartée) dans `data/idees.json`.
