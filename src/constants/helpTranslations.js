export const helpTranslations = {
  fr: {
    title: 'Centre d\'aide',
    subtitle: 'Réponses express pour ECHO',
    quickStart: {
      heading: 'Prise en main rapide',
      description: 'Suivez ces étapes pour générer un courriel prêt à envoyer en moins d\'une minute.',
      bullets: [
        'Choisissez un modèle dans la colonne de gauche. Utilisez la recherche et le filtre de catégories pour accélérer.',
        'Ajoutez vos informations : tapez directement dans les zones "Objet" et "Message" ou utilisez le popup Variables pour profiter des mises à jour en temps réel.',
        'Copiez le résultat (objet, corps ou tout) ou composez directement dans Outlook lorsque vous êtes satisfait.'
      ]
    },
    sections: {
      copilot: {
        heading: 'Assistant Copilot M365',
        intro: 'L\'assistant Copilot vous aide à améliorer vos courriels avec 12 actions rapides : améliorer, formaliser, simplifier, corriger, traduire, etc.',
        stepsHeading: 'Comment utiliser (4 étapes) :',
        steps: [
          'Rédigez votre courriel dans l\'éditeur ECHO avec vos variables remplies.',
          'Dans le panneau Copilot (à droite), cliquez sur une action (ex. « Améliorer ») ou tapez une instruction personnalisée puis cliquez « Copier ».',
          'Ouvrez Copilot dans Edge, Word ou Outlook (icône Copilot ou raccourci).',
          'Collez avec Ctrl+V — Copilot génère une version améliorée que vous pouvez copier et utiliser.'
        ],
        customHeading: 'Instruction personnalisée :',
        customSteps: [
          'Tapez votre demande dans le champ texte (ex. « Réduis à 80 mots avec un ton inspirant »).',
          'Cliquez le bouton « Copier » à côté du champ.',
          'Collez dans Copilot pour obtenir exactement ce que vous avez demandé.'
        ],
        points: [
          'Les variables sont préservées automatiquement : Copilot voit les valeurs réelles, pas les noms de variables.'
        ]
      },
      variables: {
        heading: 'Variables & pastilles',
        points: [
          'Les variables apparaissent comme des pastilles colorées dans l\'Objet et le Corps. Cliquez dessus pour les modifier directement.',
          'Les pastilles montrent la valeur en temps réel avec le nom de la variable. Le système extrait automatiquement les valeurs lors du copier-coller.',
          'Utilisez le panneau Variables pour voir et éditer toutes les valeurs d\'un coup; la synchronisation est bidirectionnelle et instantanée.',
          'Les variables sont préservées lors de l\'utilisation de l\'assistant Copilot et apparaissent avec leurs valeurs réelles dans les prompts.'
        ]
      },
      popout: {
        heading: 'Fenêtre détachée (popout)',
        points: [
          'Ouvrez le panneau Variables dans une fenêtre séparée pour travailler côte à côte.',
          'À l\'ouverture, les valeurs sont extraites immédiatement de l\'Objet et du Corps (via les pastilles).',
          'Les changements dans l\'une ou l\'autre fenêtre se reflètent automatiquement (BroadcastChannel).'
        ]
      },
      copying: {
        heading: 'Copier & Partager',
        points: [
          'Les boutons Copier Objet / Copier Corps / Copier Tout incluent vos valeurs actuelles et le formatage riche (gras, surlignage, etc.).',
          'Utilisez « Copier Tout » puis collez dans votre client de messagerie préféré pour conserver le gras, les couleurs et le surlignage.',
          'Le lien direct (icône de lien) inclut l\'identifiant et la langue dans l\'URL pour partager le modèle avec des collègues.',
          'Les actions Copilot copient automatiquement le prompt complet avec les valeurs des variables injectées pour une utilisation immédiate dans Copilot.'
        ]
      },
      favorites: {
        heading: 'Favoris',
        points: [
          'Cliquez l\'étoile ★ dans le coin supérieur droit de chaque carte de modèle (dans la liste à gauche) pour l\'ajouter aux favoris. L\'étoile devient dorée une fois ajouté.',
          'Activez « Afficher uniquement les favoris » pour filtrer la liste.',
          'Les favoris sont mémorisés localement dans le navigateur.'
        ]
      },
      shortcuts: {
        heading: 'Raccourcis clavier',
        items: [
          ['Ctrl/Cmd + Entrée', 'Copier tout'],
          ['Ctrl/Cmd + B', 'Copier le corps'],
          ['Ctrl/Cmd + J', 'Copier l\'objet'],
          ['Ctrl/Cmd + /', 'Focus sur la recherche'],
          ['Ctrl/Cmd + R (Variables)', 'Réinitialiser aux exemples'],
          ['Ctrl/Cmd + Shift + V (Variables)', 'Collage intelligent var: valeur']
        ]
      },
      admin: {
        heading: 'Console d\'administration',
        points: [
          'Un bouton Admin discret est disponible en bas à gauche de la page principale.',
          'L\'accès à la console est protégé par mot de passe (demandez-le à votre gestionnaire).',
          'La console permet de créer, modifier et supprimer des modèles de courriels.',
          'Les modifications doivent être publiées sur GitHub pour être visibles par tous les utilisateurs.'
        ]
      },
      privacy: {
        heading: 'Confidentialité & stockage',
        points: [
          'Tout fonctionne localement dans votre navigateur. Aucune donnée n\'est envoyée à un serveur, sauf si vous soumettez le formulaire de contact.',
          'Les préférences (langues, favoris, etc.) et les variables en cours sont sauvegardées en local.'
        ]
      }
    },
    faq: {
      heading: 'Questions fréquentes',
      items: [
        {
          question: 'Les valeurs du popup correspondent-elles toujours au texte ?',
          answer: 'Oui. À l\'ouverture, le popup synchronise immédiatement les valeurs actuelles grâce à l\'extraction directe de l\'objet et du message. Les modifications faites dans le texte sont détectées automatiquement.'
        },
        {
          question: 'Comment utiliser les boutons X et Réinitialiser sur les cartes de variables ?',
          answer: 'Le bouton X supprime la pastille de la variable du texte de votre courriel. Le bouton Réinitialiser restaure la variable avec sa valeur d\'exemple d\'origine et réinsère la pastille dans le texte.'
        },
        {
          question: 'Comment revenir aux valeurs par défaut ?',
          answer: 'Utilisez le bouton Réinitialiser dans l\'éditeur. Il recharge le modèle sélectionné, restaure les valeurs d\'exemple et efface les champs personnalisés.'
        },
        {
          question: 'Puis-je travailler sans connexion ?',
          answer: 'Oui. Tous les traitements se font dans votre navigateur et les données restent locales.'
        }
      ]
    },
    troubleshooting: {
      heading: 'Dépannage express',
      items: [
        {
          title: 'Le popup ne montre pas les nouvelles valeurs',
          steps: [
            'Fermez puis rouvrez le popup pour déclencher une synchronisation complète.',
            'Vérifiez que vous n\'êtes pas sur un onglet inactif qui bloquerait les BroadcastChannels (certains navigateurs limitent la communication).',
            'Rechargez la page avec ⇧ + ⌘ + R (Mac) ou ⇧ + Ctrl + R (Windows) pour repartir d\'un état propre.'
          ]
        }
      ]
    },
    resources: {
      heading: 'Ressources utiles',
      links: []
    },
    contact: {
      heading: 'Besoin d\'un coup de main ?',
      description: 'Choisissez ce qui décrit le mieux votre demande et envoyez-nous un court message.',
      options: [
        {
          value: 'support',
          label: 'Support',
          helper: 'Accès, permissions ou fonctionnement général',
          messageLabel: 'Décrivez la situation',
          placeholder: 'Expliquez ce dont vous avez besoin, les personnes impliquées et les échéances.'
        },
        {
          value: 'glitch',
          label: 'Glitch / bogue',
          helper: 'Fonctionnalité en panne ou comportement étrange',
          messageLabel: 'Que s\'est-il produit ?',
          placeholder: 'Ajoutez les étapes pour reproduire, le navigateur utilisé et tout message d\'erreur.'
        },
        {
          value: 'improvement',
          label: 'Amélioration / idée',
          helper: 'Partagez une idée ou une optimisation pour ECHO',
          messageLabel: 'Quelle est votre suggestion ?',
          placeholder: 'Décrivez l\'amélioration souhaitée et l\'impact attendu.'
        },
        {
          value: 'template',
          label: 'Soumettre un modèle',
          helper: 'Envoyez un modèle à réviser ou à publier',
          messageLabel: 'Présentez votre modèle',
          placeholder: 'Résumé, ton, contexte d\'utilisation et points à surveiller.',
          extraField: {
            label: 'Lien vers le fichier ou SharePoint (facultatif)',
            placeholder: 'Collez un lien vers Teams, OneDrive ou SharePoint.'
          }
        }
      ],
      form: {
        nameLabel: 'Nom complet',
        namePlaceholder: 'Ex. Marie Dubois',
        emailLabel: 'Courriel professionnel',
        emailPlaceholder: 'prenom.nom@tpsgc-pwgsc.gc.ca',
        messageLabelFallback: 'Message',
        optional: '(facultatif)',
        submit: 'Envoyer la demande',
        submitting: 'Envoi en cours…',
        successTitle: 'Merci !',
        successMessage: 'Votre message a été transmis à l\'équipe. Nous vous répondrons sous deux jours ouvrables.',
        sendAnother: 'Envoyer une autre demande',
        errorTitle: 'Oups…',
        errorMessage: () => 'Impossible d\'envoyer pour le moment. Réessayez plus tard ou contactez le support technique.',
        validation: {
          nameRequired: 'Indiquez votre nom.',
          emailRequired: 'Entrez un courriel valide.',
          messageRequired: 'Merci d\'ajouter quelques détails.'
        },
        extraHelp: 'Pour les soumissions de modèles, joignez un lien accessible si possible.'
      },
      close: 'Fermer le centre d\'aide'
    }
  },
  en: {
    title: 'Help Centre',
    subtitle: 'Get answers fast for ECHO',
    quickStart: {
      heading: 'Quick start',
      description: 'Follow these steps to produce a ready-to-send message in under a minute.',
      bullets: [
        'Pick a template from the left rail. Use search and category filters to narrow the list.',
        'Add your details: type directly in the Subject and Message areas or open the Variables popout for real-time updates.',
        'Copy the result (subject, body, or everything) or launch Outlook when you\'re happy with the message.'
      ]
    },
    sections: {
      copilot: {
        heading: 'M365 Copilot Assistant',
        intro: 'The Copilot Assistant helps enhance your emails with 12 quick actions: improve, formalize, simplify, fix grammar, translate, and more.',
        stepsHeading: 'How to use (4 steps):',
        steps: [
          'Compose your email in the ECHO editor with your variables filled in.',
          'In the Copilot panel (on the right), click an action (e.g., "Improve") or type a custom instruction and click "Copy".',
          'Open Copilot in Edge, Word, or Outlook (Copilot icon or shortcut).',
          'Paste with Ctrl+V — Copilot generates an improved version you can copy and use.'
        ],
        customHeading: 'Custom instruction:',
        customSteps: [
          'Type your request in the text field (e.g., "Rewrite in 80 words with a confident tone").',
          'Click the "Copy" button next to the field.',
          'Paste into Copilot to get exactly what you asked for.'
        ],
        points: [
          'Variables are preserved automatically: Copilot sees the actual values, not variable names.'
        ]
      },
      variables: {
        heading: 'Variables & pills',
        points: [
          'Variables appear as colored pills in Subject and Body. Click them to edit values directly.',
          'Pills display real-time values with variable names. The system automatically extracts values during copy operations.',
          'Use the Variables panel to view/edit all values at once; syncing is bidirectional and instantaneous.',
          'Variables are preserved when using the Copilot Assistant and appear with their actual values in prompts.'
        ]
      },
      popout: {
        heading: 'Detached window (popout)',
        points: [
          'Open Variables in a separate window to work side-by-side.',
          'When opening, values are extracted immediately from the Subject and Body (via the pills).',
          'Edits reflect both ways automatically using BroadcastChannel.'
        ]
      },
      copying: {
        heading: 'Copying & Sharing',
        points: [
          'Copy Subject / Copy Body / Copy All buttons include your current values and preserve rich formatting (bold, highlights, etc.).',
          'Use "Copy All" and paste into your preferred email client to preserve bold, colors, and highlights.',
          'The direct-link icon includes id & language in the URL to share the template with colleagues.',
          'Copilot actions automatically copy the complete prompt with injected variable values for immediate use in Copilot.'
        ]
      },
      favorites: {
        heading: 'Favorites',
        points: [
          'Click the ★ star in the top-right corner of each template card (in the list on the left) to add it to your favorites. The star turns gold once added.',
          'Turn on "Show only favorites" to filter the list.',
          'Favorites are stored locally in your browser.'
        ]
      },
      shortcuts: {
        heading: 'Keyboard shortcuts',
        items: [
          ['Ctrl/Cmd + Enter', 'Copy all'],
          ['Ctrl/Cmd + B', 'Copy body'],
          ['Ctrl/Cmd + J', 'Copy subject'],
          ['Ctrl/Cmd + /', 'Focus search'],
          ['Ctrl/Cmd + R (Variables)', 'Reset to examples'],
          ['Ctrl/Cmd + Shift + V (Variables)', 'Smart paste var: value']
        ]
      },
      admin: {
        heading: 'Admin Console',
        points: [
          'A discreet Admin button is available at the bottom-left of the main page.',
          'Console access is password-protected (ask your manager for credentials).',
          'The console allows creating, editing, and deleting email templates.',
          'Changes must be published to GitHub to be visible to all users.'
        ]
      },
      privacy: {
        heading: 'Privacy & storage',
        points: [
          'Everything runs locally in your browser. No data is sent to a server unless you submit the contact form.',
          'Preferences (languages, favorites, etc.) and in-progress variables are saved in local storage.'
        ]
      }
    },
    faq: {
      heading: 'Frequently asked questions',
      items: [
        {
          question: 'Does the popout always match the main editors?',
          answer: 'Yes. Opening the popout triggers an immediate sync that extracts the current subject and body. Text edits are auto-detected and reflected back.'
        },
        {
          question: 'How do I use the X and Reinitialize buttons on variable cards?',
          answer: 'The X button removes the variable pill from your email text. The Reinitialize button restores the variable with its original example value and reinserts the pill into the text.'
        },
        {
          question: 'How do I restore default example values?',
          answer: 'Use the Reset button in the editor. It reloads the selected template, restores example values, and clears custom text fields.'
        },
        {
          question: 'Can I work offline?',
          answer: 'Absolutely. Everything runs in your browser and data stays local.'
        }
      ]
    },
    troubleshooting: {
      heading: 'Troubleshooting checklist',
      items: [
        {
          title: 'Popout is missing recent edits',
          steps: [
            'Close and reopen the popout to force a full refresh.',
            'Make sure the tab stays active—some browsers pause BroadcastChannels in background tabs.',
            'Hard reload with ⇧ + ⌘ + R (Mac) or ⇧ + Ctrl + R (Windows) to clear cached state.'
          ]
        }
      ]
    },
    resources: {
      heading: 'Helpful resources',
      links: []
    },
    contact: {
      heading: 'Need something else?',
      description: 'Pick the option that fits best and send us a quick note.',
      options: [
        {
          value: 'support',
          label: 'Support',
          helper: 'Access, permissions, or general guidance',
          messageLabel: 'Tell us what you need',
          placeholder: 'Share the context, people involved, and any deadlines.'
        },
        {
          value: 'glitch',
          label: 'Glitch',
          helper: 'Broken feature or unexpected behaviour',
          messageLabel: 'What happened?',
          placeholder: 'List the steps to reproduce, browser used, and any error messages.'
        },
        {
          value: 'improvement',
          label: 'Improvement / suggestion',
          helper: 'Share an idea to make ECHO better',
          messageLabel: 'What would you improve?',
          placeholder: 'Describe the enhancement and the impact you expect.'
        },
        {
          value: 'template',
          label: 'Submit a template',
          helper: 'Send a new template or a modification',
          messageLabel: 'Describe your template',
          placeholder: 'Summarize tone, audience, context, and any review notes.',
          extraField: {
            label: 'Link to files or SharePoint (optional)',
            placeholder: 'Paste a Teams, OneDrive, or SharePoint link.'
          }
        }
      ],
      form: {
        nameLabel: 'Full name',
        namePlaceholder: 'e.g. Sarah Thompson',
        emailLabel: 'Work email',
        emailPlaceholder: 'firstname.lastname@tpsgc-pwgsc.gc.ca',
        messageLabelFallback: 'Message',
        optional: '(optional)',
        submit: 'Send request',
        submitting: 'Sending…',
        successTitle: 'Thanks!',
        successMessage: 'Your message is on its way. We usually respond within two business days.',
        sendAnother: 'Send another request',
        errorTitle: 'Uh-oh…',
        errorMessage: () => 'We couldn\'t send your message. Try again later or contact technical support.',
        validation: {
          nameRequired: 'Please share your name.',
          emailRequired: 'Enter a valid email address.',
          messageRequired: 'Add a few details so we can help.'
        },
        extraHelp: 'For template submissions, include a link we can open if possible.'
      },
      close: 'Close help centre'
    }
  }
}
