// Built by tools/build.mjs from invite.json. Edit invite.json and rebuild; changes here are overwritten.
window.INVITE = {
  "eventSlug": "demo",
  "demo": true,
  "site": "https://zaproszenie.cotoaleksandra.com/demo",
  "languages": [
    "pl",
    "en"
  ],
  "voice": "f",
  "seal": {
    "initials": "K",
    "wax": "#6e1018"
  },
  "card": {
    "number": "XXX",
    "photo": "",
    "titleHeavy": "KASIA",
    "titleScript": "thirty"
  },
  "og": {
    "date": "23.01.2027",
    "line": "zaproszenie · kasia · thirty"
  },
  "rsvpFields": [
    {
      "id": "name",
      "type": "text",
      "required": true,
      "max": 80,
      "label": {
        "pl": "Imię i nazwisko",
        "en": "Your name"
      }
    },
    {
      "id": "attending",
      "type": "choice",
      "required": true,
      "label": {
        "pl": "Będziesz?",
        "en": "Will you come?"
      },
      "options": [
        {
          "v": "yes",
          "pl": "Tak",
          "en": "Yes"
        },
        {
          "v": "no",
          "pl": "Nie",
          "en": "No"
        }
      ]
    },
    {
      "id": "plus_one",
      "type": "choice",
      "showIf": {
        "attending": "yes"
      },
      "label": {
        "pl": "Czy przyjdziesz z osobą towarzyszącą (+1)?",
        "en": "Are you bringing a +1?"
      },
      "options": [
        {
          "v": "yes",
          "pl": "Tak",
          "en": "Yes"
        },
        {
          "v": "no",
          "pl": "Nie",
          "en": "No"
        }
      ]
    },
    {
      "id": "email",
      "type": "email",
      "required": true,
      "max": 200,
      "showIf": {
        "attending": "yes"
      },
      "label": {
        "pl": "Twój email",
        "en": "Your email"
      },
      "hint": {
        "pl": "Dostaniesz potwierdzenie i wszystkie szczegóły. Email służy tylko do tego, nic więcej.",
        "en": "You'll get a confirmation with all the details. Your email is only used for this, nothing else."
      }
    },
    {
      "id": "diet",
      "type": "text",
      "max": 300,
      "label": {
        "pl": "Dieta lub alergie?",
        "en": "Any diet or allergies?"
      },
      "showIf": {
        "attending": "yes"
      }
    },
    {
      "id": "message",
      "type": "textarea",
      "max": 1000,
      "label": {
        "pl": "Wiadomość lub pytanie (opcjonalnie)",
        "en": "Message or question (optional)"
      }
    }
  ]
};
