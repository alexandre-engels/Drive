# Google Workspace File Converter 🚀

Outil web d'automatisation pour Google Apps Script conçu pour simplifier la migration de fichiers Microsoft Office, PDF et Images vers l'écosystème Google Workspace (Docs, Sheets, Slides).

## 🌟 Points Forts

- **Migration Massive** : Convertissez des dossiers entiers de manière récursive.
- **Batch Processing** : Système de traitement par lots de 5 fichiers pour contourner la limite d'exécution des 6 minutes de Google Apps Script.
- **Support OCR** : Conversion intelligente des images et PDF en texte éditable (Google Docs).
- **Archivage Propre** : Option pour supprimer ou déplacer les fichiers originaux après conversion.
- **Interface Moderne** : UI dynamique avec thèmes personnalisables (CSS Custom Properties).
- **Compatibilité Clasp** : Déploiement GAS simplifié depuis Clasp : https://github.com/google/clasp
## 🛠️ Architecture Technique

| Composant | Technologie | Rôle |
| :--- | :--- | :--- |
| **Serveur** | Google Apps Script | Logique métier et interaction API Drive |
| **Client** | HTML5 / Vanilla JS | Interface utilisateur et gestion des appels batch |
| **API** | Drive API v2 | Utilisée pour sa gestion native de la conversion lors de la copie |

## 🚀 Installation & Déploiement

1. Créez un nouveau projet sur [Google Apps Script](https://script.google.com/).
2. Copiez le contenu des fichiers du dossier `src/` de ce dépôt dans votre projet.
3. **Activer l'API Drive** : 
   - Allez dans "Services" (icône + à gauche).
   - Ajoutez "Drive API" et sélectionnez la version **v2**.
4. **Configuration du Manifeste** :
   Assurez-vous que votre fichier `appsscript.json` contient les scopes suivants :
   ```json
   "oauthScopes": [
     "https://www.googleapis.com/auth/drive",
     "https://www.googleapis.com/auth/script.storage",
     "https://www.googleapis.com/auth/script.container.ui"
   ]
