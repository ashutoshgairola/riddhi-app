# Riddhi (₹iddhi) — App Design Spec

**Date:** 2026-06-28
**Source:** Claude Design handoff bundle (`project/riddhi/`) + `riddhi-design-doc.md`
**Goal:** Pixel-perfect React Native mobile app reproducing `Riddhi Mobile.html`, plus a NestJS + PostgreSQL backend serving all data the app needs.

## Scope decisions (confirmed with user)

- **Sequencing:** Monorepo — scaffold both `mobile/` and `backend/` so each compiles/runs, then deepen each screen/module over iterative passes.
- **Secrets:** Use `.env` placeholders (`ANTHROPIC_API_KEY`, `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PORT`). No real secrets needed to build; user fills them to run.
- **Fidelity bar:** Every interaction reproduced exactly — count-up, Catmull-Rom area chart, sliding seg pill, swipe rows, sheet drag, FAB radial stack, pull-to-refresh, iOS + Android platform variants.
- **Testing:** none required.

## Repo layout

```
riddhi-app/
  mobile/          Expo (managed) + TypeScript — React Native app
  backend/         NestJS + TypeORM + Postgres — REST + GraphQL
  docs/            specs
  README.md        existing handoff bundle README
```

Two independent packages. No shared workspace tooling beyond the top-level README.

---

## Part A — Mobile app

### Tech stack
- Expo (managed) + TypeScript
- React Navigation v6 (native-stack + bottom-tabs)
- React Native Reanimated 3 (all animations)
- React Native Gesture Handler (swipe rows, sheet drag, FAB)
- `react-native-svg` (charts, icons)
- `expo-blur` (glass effect — RN has no CSS `backdrop-filter`)
- `@react-native-async-storage/async-storage` (theme persistence, key `riddhi-theme`)
- `expo-font` (Plus Jakarta Sans, weights 400/500/600/700/800)
- Anthropic via backend `/ai-chat` (preferred) or direct `fetch` to Anthropic API (`claude-sonnet-4-6`)

### Theme / token system (foundation)
- Port `mobile.css` `:root` and `[data-theme="light"]` + `platform.css` into `src/theme/tokens.ts`.
- Two flat token objects (`dark`, `light`) keyed to CSS var names: `bg`, `bg1..bg4`, `glass`, `glassHov`, `border`, `borderStr`, `text1/2/3`, `em`, `emDim`, `emGlow`, `red`, `amber`, `blue`, `violet`, `cyan` (+ `*Dim`), `glassBg`, `glassBg2`, `glassBrd`, `glassBrd2`, `glassHi`, radii `r.sm..r.3xl`, easing curves (`ease` `cubic-bezier(.32,.72,0,1)`, `spring` `cubic-bezier(.34,1.56,.64,1)`) as Reanimated easing/spring configs.
- `ThemeProvider` (React Context + AsyncStorage) exposes `t` (active tokens) and `toggle()`. Default `dark`. Persisted on change. This single swap reproduces the prototype's light-mode behaviour.

### Exact token values (dark — copy 1:1)
`bg #0e0b15 · bg1 #17131f · bg2 #1f1a2c · bg3 #2a2339 · bg4 #342c45 · em #b6a4f3 · emDim rgba(182,164,243,0.14) · emGlow rgba(182,164,243,0.25) · red #ff6b85 · amber #ffc24b · blue #6ea8ff · violet #a78bfa · cyan #5ee0d8 · text1 #f3f0fb · text2 #9a90b5 · text3 #635a7a · glassBg rgba(255,255,255,0.055) · glassBg2 rgba(255,255,255,0.09) · glassBrd rgba(255,255,255,0.10) · glassBrd2 rgba(255,255,255,0.18)`. Radii: sm 12, md 16, lg 20, xl 26, 2xl 32, 3xl 38. Light theme: full token swap per `mobile.css` `[data-theme="light"]`.

### Glass primitive
`<GlassCard>` = `expo-blur` `BlurView` (intensity tuned to ~22px blur) + semi-transparent `glassBg`/`glassBrd` border overlay + `glassHi` inset highlight. Used by all card/topbar/tabbar/sheet/toast surfaces.

### Shared primitives (`src/components/`) — from `MobileCore.jsx`
- `useCountUp(target, duration=900, delay=0)` — Reanimated shared value, easing `1 - 2^(-10t)`, lands on exact target.
- `BottomSheet` — Gesture Handler pan + Reanimated; drag down, dismiss past 100px; backdrop fade; handle zone; title + headerRight close button; scrollable body.
- `MSeg` — sliding pill segmented control; measures active button, animates indicator `transform`/`width` with spring.
- `PullToRefresh` — pull from top, threshold 60px, spinner rotates with pull then spins; 900ms refresh. Match prototype spinner visually.
- `MSparkline` — svg area + line, linear gradient fill.
- `WeekChart` — svg Catmull-Rom→cubic-bezier `smoothPath` (ported verbatim), area fill fade-in, line draw-in (stroke-dashoffset), peak marker dot + dashed line, day labels (peak highlighted).
- `MI` icons — every SVG in `MobileCore.jsx` ported to `react-native-svg` components.
- Toast host + Action-sheet host — Context-based (replaces prototype `window` CustomEvent bus). `mToast(msg, icon)`, `mSheet({title, options:[{label, icon, danger, onClick}]})`.

### Navigation shell (`src/app/`) — from `MobileApp.jsx`
- Bottom-tab navigator: Home, Activity(txns), [FAB], Budget, More. `More` opens a `MoreSheet` BottomSheet (not a route). Primary tabs reset stack root; secondary destinations push.
- Native-stack for pushed screens: reports, sync, chat, accounts, account-detail, tx-cats, settings, notifs, search, tx-detail. iOS `slide_from_right` / Android `fade` (`pageInMd` scale+fade).
- **Platform prop** (`ios` default, `android`): iOS centre FAB in tab bar with radial action stack (staggered, `bottom: 100 + i*64`); Android Material-3 NavBar with pill indicators + bottom-right M3 FAB + speed-dial stacking upward (`96+56+12 + i*64`, right-aligned).
- FAB radial actions: Ask Riddhi (→chat), Add Expense, Add Income, Transfer (→AddTx sheet). Backdrop blur; FAB rotates 45° when open.
- `AddTxSheet`: type seg (expense/income/transfer), large amount display, numeric keypad (1-9, ., 0, del — 2-decimal cap, 8-char cap), category chips per type (`QA_CATS`), note input, receipt attach (image picker), Save button.
- `ProfileSheet`: avatar, name/email, PRO badge, menu rows, sign out.
- Replace `window.RiddhiApp` global with a navigation/actions Context (`openAdd`, `nav`, `push`, `pop`).

### Screens (`src/screens/`) — all 15
Ported 1:1 with data as local mock constants (from each prototype file) so the app runs immediately; a thin `src/api/` client layer is ready to swap to the backend.

| Screen | Source | Key details |
|---|---|---|
| home | MobileHome | hero "safe to spend" count-up, progress track, SMS banner, WeekChart, recent txns; pull-to-refresh; topbar scrolled state |
| txns | MobileTxns | summary cards, filter seg (all/inc/exp), date grouping (Today/Yesterday/long), SwipeRow (±90px, left=delete red, right=edit blue), filter sheet |
| budgets | MobileSecondary | overall ring (count-up %, colour by threshold), category cards with progress + over-budget warning |
| goals | MobileSecondary | goal cards, top accent bar, progress bar, L/K formatting |
| invest | MobileSecondary | portfolio hero gradient + sparkline, holdings list with return colour |
| reports | MobileScreens | 5 sub-tabs (overview/income/expense/savings/wealth), period seg, KPI strip, grouped bars, donut, sparklines, breakdowns |
| sync | MobileSync | status card + toggle, connected banks, DetectedCard confirm/dismiss animations (slide + collapse), auto-added list, add-all |
| chat | MobileChat | empty state suggestions, scan-bill, message bubbles, ChatTxCard, typing dots, composer; askRiddhi |
| accounts | MobileScreens | net-worth hero, account cards (gradient per type), drill-down |
| account-detail | MobileScreens | balance card, quick actions, recent txns |
| tx-cats | MobileScreens | seg filter, category cards with sub-cat chips |
| settings | MobileScreens | profile card, Preferences (theme seg → real toggle), Privacy, Notifications, Data, About sections; toggles |
| notifs | MobileScreens | chip filter, notification cards, unread dot |
| search | MobileScreens | autofocus input, recent, jump-to pages filter |
| tx-detail | MobileScreens | big amount, detail rows, note card, edit/delete |

### AI chat (exact behaviour from `MobileChat.jsx`)
- `CHAT_CONTEXT` system prompt used **verbatim**.
- `askRiddhi(history)`: builds prompt, calls backend `/ai-chat` (or Anthropic `claude-sonnet-4-6` directly), extracts JSON between first `{` and last `}`, returns `{reply, transaction}`.
- On any error → `localParse(lastUserText)` (ported verbatim: amount regex, income detection, category keyword map, time parse, merchant extraction, goal/budget canned answers).
- Receipt scan: image picker → simulated `RECEIPT_RESULTS` cycle (UI-only, as prototype).

### SMS Sync
UI-only for MVP (no device SMS access). Confirm/dismiss card animations exactly as `MobileSync.jsx` (slide ±40px + collapse maxHeight/opacity over 360ms).

---

## Part B — Backend (NestJS + PostgreSQL)

### Tech stack
- NestJS, TypeORM (Postgres), `synchronize: true` in dev + migrations.
- Passport-JWT: access + refresh tokens; bcrypt password hashing.
- `@nestjs/graphql` schema-first; DataLoader for N+1 (e.g. transaction → category).
- class-validator DTOs; custom repository class per module.
- `@UseGuards(JwtAuthGuard)` on all non-auth routes.

### Modules (`src/`)
`auth, users, accounts, transactions, categories, budgets, goals, investments, notifications, reports, sms-sync, ai-chat`.

Each (where it owns an entity): Entity (TypeORM, matching Section 18) + DTOs (create/update) + Service (business logic, computed fields) + custom Repository + Controller (guarded) + GraphQL resolver.

### Entities — Section 18 of design doc (authoritative)
- **User**: id, name, email, password(hash), isFirstLogin.
- **Account**: id, name, type(checking/savings/credit/investment/cash/loan/other), balance, currency(default INR), institutionName?, institutionLogo?, isConnected, includeInNetWorth, color?, lastUpdated. `balance` exposed as computed field reconciled from transactions where applicable.
- **Transaction**: id, date, description, amount(positive), type(income/expense/transfer), categoryId, accountId?, status(pending/cleared/reconciled/void), notes?, tags[], attachments[], isRecurring, recurringDetails?(frequency daily/weekly/monthly/yearly, interval, endDate, nextDate).
- **TransactionCategory**: id, name, color?, icon?, description?, parentId? (subcategories).
- **Budget**: id, name, startDate, endDate, income, totalAllocated(computed), totalSpent(computed), categories[].
- **BudgetCategory**: id, name, allocated, spent(computed), categoryIds[], color?, icon?, rollover, notes?.
- **Goal**: id, name, type(savings/debt/retirement/major_purchase/other), targetAmount, currentAmount, startDate, targetDate, accountId?, priority, status(active/completed/paused), contributionFrequency?, contributionAmount?, color?, notes?. Computed: progress %, remaining, projected completion date.
- **Investment**: id, name, ticker?, assetClass, type, shares, purchasePrice, currentPrice, purchaseDate, accountId, dividendYield?, sector?, region?, currency(default INR), notes?. Computed: currentValue, totalInvested, gainLoss, returnPercent.
- **InvestmentTransaction**: id, investmentId, type(buy/sell/dividend), shares?, price?, amount, date, notes?.
- **Notification**: id, type(budget_alert/goal_progress/large_transaction/monthly_report/security_alert), title, body, read, createdAt.
- **UserPreferences**: currency(INR), dateFormat, theme(light/dark/system), startOfWeek(sunday/monday), language.

### REST endpoints
- Standard CRUD per resource. Transactions: filter by type/category/date/account + pagination.
- Categories: CRUD with `parentId`.
- Budgets: computed `totalSpent` by joining transactions.
- Goals: computed progress%, projected completion date.
- Investments: computed currentValue, gainLoss, returnPercent.
- Notifications: list, mark-read, mark-all-read.
- **Reports** (GET):
  - `/reports/overview?period=1m|3m|6m|1y` → `{ netIncome, savingsRate, totalIncome, totalExpenses }`
  - `/reports/income-vs-expense?period=6m` → monthly bars array
  - `/reports/categories?period=1m` → spending by category with % share
  - `/reports/net-worth-trend?period=6m` → monthly net worth array
- **`/sms-sync/parse`** (POST): raw SMS string → `{ merchant, amount, category, account, bank, last4, confidence }`. Regex + keyword map over categories in `MobileSync.jsx` (Food, Utilities, Income, Shopping, Transport, Entertainment, Groceries, Bills, Health). Handle `Rs.`/`INR`/`₹` amount formats.
- **`/ai-chat`** (POST): inject user's live budget/goal context from DB into `CHAT_CONTEXT`, proxy to Anthropic (`claude-sonnet-4-6`), validate `{reply, transaction}` shape; if `transaction` non-null, persist to transactions table. Return `{reply, transaction}`.

### GraphQL
Schema-first. Queries + mutations for all entities alongside REST. DataLoader batches relations (transaction→category, etc.).

### Seed
Indian-market data matching the prototypes: user "Riddhi Desai" (riddhi@example.com), accounts HDFC Savings / ICICI Credit / Axis / Zerodha / Paytm / SBI, April 2026 transactions (Salary, Swiggy, Rent, BESCOM, Metro, Netflix, Myntra, Apollo, SIP, Freelance, BPCL), budget categories (Housing/Food/Transport/Shopping/Utilities/Healthcare/Entertainment), 4 goals (Emergency Fund, Goa Trip, MacBook Pro, House Down Pay), 5 holdings (Nifty 50 ETF, HDFC Bank, Tata Motors, Reliance, Gold ETF), notifications.

### Env config
`DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, ANTHROPIC_API_KEY, PORT=3000`. `.env.example` committed; real `.env` gitignored.

---

## Build order (iterative)

1. **Scaffold both** so each runs: Expo boots to a themed Home; Nest boots with health route + DB connection + config.
2. **Mobile depth:** tokens → theme provider → glass primitive → shared primitives → screens (home first, then remainder), full fidelity, on mock data.
3. **Backend depth:** entities + migrations + seed → auth → CRUD modules → reports → sms-sync → ai-chat → GraphQL resolvers.
4. **Wire** mobile `src/api/` to backend; replace mock constants with live fetches.

## Out of scope (YAGNI)
- Real on-device SMS reading (sync is UI-only).
- Desktop web app (prototype `Riddhi App.html` etc. — mobile is the target).
- Bank-logo SVG set (80+ files) — use initials/colour as the mobile prototype does.
- Automated tests.
- Onboarding wizard / auth screens on mobile (prototype starts logged-in at Home; backend still implements auth for API).

## Notes / reconciliations
- Mobile mock data uses a simpler transaction shape (`amount` signed, `cCol`) than Section 18 (`amount` positive + `type`). Backend is authoritative (Section 18); mobile `api/` layer adapts API shape → view-model on wire-up.
- The primary working directory is **not** a git repo, so this spec is written but not committed; will init git if/when the user wants version control.
