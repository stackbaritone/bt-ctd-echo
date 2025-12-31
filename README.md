# ECHO - Assistant de modèles de courriels

> Application web de gestion de modèles de courriels avec édition de texte riche, variables dynamiques et support bilingue (FR/EN).

[![Demo](https://img.shields.io/badge/demo-live-success)](https://bt-ctd-echo.bt-tb.ca/)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/snarky1980/bt-ctd-echo)

---

## Fonctionnalités

### Éditeur de texte riche

- Mise en forme complète (gras, italique, souligné, barré)
- Surlignage en 6 couleurs, 8 couleurs de texte
- Sélection de polices et tailles avec prévisualisation
- Listes à puces et numérotées

### Gestion des variables

- Variables dynamiques : `<<NomClient>>`, `<<DateLivraison>>`
- Affichage visuel en "pills" éditables
- Panneau de variables détachable (popout)
- Synchronisation automatique

### Bibliothèque de modèles

- Modèles bilingues français/anglais
- Organisation par catégories
- Recherche intelligente avec synonymes
- Système de favoris

### Export et intégration

- Copier le courriel formaté dans le presse-papier
- Coller directement dans Outlook (classique/web) ou tout client courriel
- Préservation complète du formatage riche

---

## Démarrage rapide

### Utilisation en ligne

**<https://bt-ctd-echo.bt-tb.ca/>**

### Développement local

```bash
# Cloner et installer
git clone https://github.com/snarky1980/bt-ctd-echo.git
cd bt-ctd-echo
npm install

# Développement
npm run dev

# Production
npm run build
```

---

## Structure du projet

```text
bt-ctd-echo/
├── src/                    # Code source React
│   ├── components/         # Composants React
│   ├── constants/          # Constantes et textes
│   ├── hooks/              # Hooks personnalisés
│   └── utils/              # Utilitaires
├── admin/                  # Interface d'administration
├── docs/                   # Documentation
└── scripts/                # Scripts utilitaires
```

---

## Documentation

| Document | Description |
| -------- | ----------- |
| [Guide Admin](docs/ADMIN-CSV-IMPORT-GUIDE.md) | Import/export de modèles et variables |
| [Rapport exécutif](docs/RAPPORT_EXECUTIF_ECHO.md) | Présentation pour la gestion |
| [Rapport sécurité](docs/RAPPORT_SECURITE.md) | Architecture et conformité |

---

## Technologies

- **React 18** + **Vite 6** - Framework et build
- **Tailwind CSS 4** - Styles
- **Radix UI** - Composants accessibles
- **Fuse.js** - Recherche floue
- **BroadcastChannel API** - Synchronisation temps réel entre fenêtres

---

## Architecture technique

### Synchronisation bidirectionnelle Main ↔ Popout

L'application permet d'éditer les variables soit dans la fenêtre principale (via les pills), soit dans une fenêtre popout détachée. Les deux restent synchronisées en temps réel.

#### Défis résolus

1. **Cursor jumping** : Les inputs React `controlled` causent un saut du curseur lors de mises à jour fréquentes
2. **Double-binding** : Les changements dans une fenêtre doivent mettre à jour l'autre sans créer de boucle infinie

#### Solution implémentée

```text
┌─────────────────┐    BroadcastChannel     ┌─────────────────┐
│  Main Window    │ ◄──────────────────────►│  Popout Window  │
│  (SimplePill    │   variablesUpdated      │  (Uncontrolled  │
│   Editor)       │   variableChanged       │   inputs)       │
└─────────────────┘                         └─────────────────┘
```

**Fichiers clés :**

- `src/App.jsx` - Gère la fenêtre principale et envoie `variablesUpdated`
- `src/VariablesPopout.jsx` - Gère le popout et envoie `variableChanged`

**Techniques critiques :**

1. **Inputs non-contrôlés** : Utilisation de `defaultValue` au lieu de `value` dans le popout pour éviter le cursor jumping

2. **Mise à jour impérative du DOM** : La fonction `applyVariablesToInputs()` met à jour les valeurs directement via `el.value = newValue`

3. **Détection du focus actif** : Avant de mettre à jour un champ, on vérifie :

   ```js
   const windowHasFocus = document.hasFocus()
   if (el === document.activeElement && windowHasFocus) continue
   ```

   Cela permet de ne pas interrompre la saisie de l'utilisateur, tout en appliquant les mises à jour quand la fenêtre n'a pas le focus.

4. **Sender ID** : Chaque fenêtre a un ID unique pour ignorer ses propres messages

#### Messages BroadcastChannel

| Message            | Direction      | Description                                    |
| ------------------ | -------------- | ---------------------------------------------- |
| `variablesUpdated` | Main → Popout  | État complet des variables après modification  |
| `variableChanged`  | Popout → Main  | Modification d'une variable spécifique         |
| `variableDeleted`  | Both           | Suppression d'une variable                     |

---

## Sécurité

- **100% côté client** - Aucune donnée transmise à un serveur
- **LocalStorage** - Préférences stockées localement uniquement
- **Contenu statique** - Modèles publics, pas de données sensibles

---

## Administration

L'interface d'administration (`/admin/admin-simple.html`) permet de :

- Éditer les modèles et variables avec formatage riche
- Importer/exporter en JSON ou Excel
- Exporter un catalogue Word complet pour usage hors-ligne
- Gérer les catégories et leurs couleurs
- Publier les changements sur GitHub en un clic

---

## Licence

MIT License

---

Bureau de la traduction - Centre de traduction et documentation
