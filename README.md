# 🏓 PingPong Tracker

PingPong Tracker est une application web moderne pour suivre, gérer et visualiser les scores et statistiques de vos matchs de ping-pong entre amis, collègues ou en club.

## Fonctionnalités

- Authentification sécurisée (inscription, connexion, déconnexion)
- Gestion des joueurs (ajout, modification, suppression, photo de profil)
- Enregistrement des matchs (1v1 et 2v2, scores, date, coéquipiers)
- Tableau de bord dynamique avec statistiques personnelles et globales
- Recherche et pagination sur les matchs récents
- Interface responsive, moderne et animée


## Démo en ligne

L'application est déployée ici : [https://pingpong-tracker.onrender.com](https://pingpong-tracker.onrender.com)

## Installation

1. Clonez ce dépôt :
   ```bash
   git clone https://github.com/votre-utilisateur/pingpong-tracker.git
   ```
2. Installez les dépendances :
   ```bash
   npm install
   ```
3. Lancez le serveur :
   ```bash
   npm start
   ```
4. Ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur.

## Structure du projet

- `public/` : Fichiers statiques (HTML, CSS, JS, images)
- `server.js` : Serveur Node.js/Express
- `pingpong.db` : Base de données SQLite

## Captures d'écran

![Dashboard](./public/preview_dashboard.png)
![Matchs récents](./public/preview_recent_matches.png)

## Contribuer

Les contributions sont les bienvenues ! Ouvrez une issue ou une pull request.

## Licence

MIT