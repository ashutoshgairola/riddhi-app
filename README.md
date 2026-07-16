<div align="center">

<img src="logo/logos/1a-logomark.svg" width="120" alt="Riddhi logomark" />

# Riddhi

**Your money, minded.** A personal finance app with an AI bookkeeper named **Munshi** —
track spends, budgets, goals, subscriptions and investments without the spreadsheet grind.

<br/>

![Expo](https://img.shields.io/badge/Expo_56-mobile-b6a4f3?style=for-the-badge&labelColor=0e0b15&logo=expo&logoColor=f3f0fb)
![React Native](https://img.shields.io/badge/React_Native-0.85-6ea8ff?style=for-the-badge&labelColor=0e0b15&logo=react&logoColor=6ea8ff)
![NestJS](https://img.shields.io/badge/NestJS_11-backend-ff6b85?style=for-the-badge&labelColor=0e0b15&logo=nestjs&logoColor=ff6b85)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-TypeORM-5ee0d8?style=for-the-badge&labelColor=0e0b15&logo=postgresql&logoColor=5ee0d8)
![Claude](https://img.shields.io/badge/Claude-Munshi_AI-ffc24b?style=for-the-badge&labelColor=0e0b15&logo=anthropic&logoColor=ffc24b)

</div>

---

## ✨ What it does

| | |
|---|---|
| 💸 **Transactions** — add, search, group and categorize spends with a custom category tree | 🏦 **Accounts & Cards** — balances, account detail, credit-card tracking |
| 📊 **Budgets** — per-category monthly budgets with progress bars that judge you gently | 🎯 **Goals** — save toward things and watch the bar fill |
| 📈 **Investments** — portfolio tracking with Skia-rendered charts | 🔁 **Subscriptions** — detected from recurring charges, reviewed before confirmed |
| 🧾 **Statements** — import bank statement PDFs, review parsed transactions before they land | 🔔 **Auto-sync** — payment notifications become transactions, uncertain ones go to needs-review |
| 🤖 **Munshi** — chat with an AI bookkeeper that reads your data and answers in plain language | 📋 **Reports & Insights** — where the money actually went |

- **Auto-sync** watches payment notifications on-device, detects transactions and subscriptions, and queues anything uncertain into a **needs-review** flow — editable before it touches your books.
- **Subscriptions** are detected from genuinely recurring charges only, with a review step before anything is confirmed.
- Local-auth (biometric) lock, secure token storage, push notifications, dark & light themes.

## 🖌 Design language

The UI is a warm near-black with a violet cast — glass cards, bento grids, `Plus Jakarta Sans` everywhere, tabular numerals for money.

| Token | Dark | Light | Role |
|-------|------|-------|------|
| `em` | ![#b6a4f3](https://img.shields.io/badge/-b6a4f3-b6a4f3) | ![#7c5cf0](https://img.shields.io/badge/-7c5cf0-7c5cf0) | Emphasis / income |
| `bg` | ![#0e0b15](https://img.shields.io/badge/-0e0b15-0e0b15) | ![#f2eefb](https://img.shields.io/badge/-f2eefb-f2eefb?logoColor=000&label=) | Canvas |
| `red` | ![#ff6b85](https://img.shields.io/badge/-ff6b85-ff6b85) | ![#e0365a](https://img.shields.io/badge/-e0365a-e0365a) | Expense / danger |
| `amber` | ![#ffc24b](https://img.shields.io/badge/-ffc24b-ffc24b) | ![#d97706](https://img.shields.io/badge/-d97706-d97706) | Warnings, budgets running hot |
| `blue` | ![#6ea8ff](https://img.shields.io/badge/-6ea8ff-6ea8ff) | ![#2563eb](https://img.shields.io/badge/-2563eb-2563eb) | Transfers |
| `cyan` | ![#5ee0d8](https://img.shields.io/badge/-5ee0d8-5ee0d8) | ![#0891b2](https://img.shields.io/badge/-0891b2-0891b2) | Accents |

Mobile spacing follows an 8pt scale of named tokens ([mobile/src/theme/spacing.ts](mobile/src/theme/spacing.ts)); design tokens live in [mobile/src/theme/tokens.ts](mobile/src/theme/tokens.ts).

## 🏗 Architecture

```mermaid
%%{init: {"theme": "base", "themeVariables": {
  "primaryColor": "#1f1a2c", "primaryTextColor": "#f3f0fb", "primaryBorderColor": "#b6a4f3",
  "lineColor": "#9a90b5", "secondaryColor": "#17131f", "tertiaryColor": "#0e0b15",
  "background": "#0e0b15", "fontFamily": "Plus Jakarta Sans, sans-serif"
}}}%%
flowchart LR
    subgraph mobile ["📱 mobile — Expo / React Native"]
        UI["Screens<br/>Home · Txns · Budgets · Goals<br/>Invest · Subs · Reports · Chat"]
        SYNC["Auto-sync<br/>notification detection<br/>+ needs-review editing"]
        PDF["Statement PDF<br/>parser & review"]
    end

    subgraph backend ["⚙️ backend — NestJS 11"]
        API["REST modules<br/>accounts · transactions · budgets<br/>goals · investments · subscriptions<br/>reports · insights · notifications"]
        MUNSHI["🤖 Munshi<br/>ai-chat via Claude"]
    end

    DB[("🐘 PostgreSQL<br/>TypeORM")]

    UI --> API
    SYNC --> API
    PDF --> API
    UI --> MUNSHI
    API --> DB
    MUNSHI --> DB
```

```
riddhi-app/
├── mobile/     # Expo app — screens, theme, auto-sync, statement parsing
├── backend/    # NestJS API — one module per domain, TypeORM + Postgres
└── logo/       # brand assets
```

## 🚀 Getting started

**Backend**

```bash
cd backend
npm install
npm run seed        # seed the database
npm run start:dev   # http://localhost:3000
```

**Mobile**

```bash
cd mobile
npm install
npm start           # Expo dev server
npm run android     # or: npm run ios / npm run web
```

Point the app at your backend from the in-app backend URL setting on first launch.

## 🧪 Tests

```bash
cd backend && npm test    # unit + e2e (npm run test:e2e)
cd mobile  && npm test    # jest + ts-jest
```

---

<div align="center">
<sub>Built with a violet cast and tabular numerals. 🪔</sub>
</div>
