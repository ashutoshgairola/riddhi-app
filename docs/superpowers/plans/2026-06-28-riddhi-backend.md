# Riddhi Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A NestJS + PostgreSQL REST + GraphQL API serving every entity the Riddhi mobile app needs, with JWT auth, computed fields, reports aggregation, SMS parsing, and an Anthropic-backed chat proxy.

**Architecture:** NestJS modular monolith. TypeORM entities mapped 1:1 to `riddhi-design-doc.md` Section 18. Passport-JWT (access + refresh, bcrypt). Schema-first GraphQL alongside REST, DataLoader for relation batching. Computed fields live in services, not columns. Custom repository class per module. Seeded with Indian-market data matching the prototypes.

**Tech Stack:** NestJS 10, TypeORM, PostgreSQL, @nestjs/passport + passport-jwt, bcrypt, class-validator/class-transformer, @nestjs/graphql + @apollo/server + graphql, dataloader, @nestjs/config, @anthropic-ai/sdk.

## Global Constraints

- **Schema authority:** `riddhi-design-doc.md` Section 18 (entities listed verbatim in the spec). Where the mobile mock differs, Section 18 wins.
- **Auth:** every non-auth route guarded by `@UseGuards(JwtAuthGuard)`. Passwords bcrypt-hashed (10 rounds). Access token (short TTL) + refresh token (long TTL), separate secrets.
- **Env:** `DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, ANTHROPIC_API_KEY, PORT` (default 3000). `.env.example` committed; `.env` gitignored. Config via `@nestjs/config` `ConfigModule.forRoot({isGlobal:true})`.
- **DB:** PostgreSQL. TypeORM `synchronize: true` in dev + migrations available. UUID primary keys (`uuid` type, `gen_random_uuid()`).
- **Money:** stored as `numeric`/`decimal` (paise-safe) or integer rupees; Transaction.amount always **positive**, direction via `type`. Currency default `"INR"`.
- **Anthropic model:** `claude-sonnet-4-6`. `CHAT_CONTEXT` system prompt (MobileChat.jsx:27–36) used verbatim, augmented with live budget/goal context from the DB.
- **SMS categories (for parser):** Food, Utilities, Income, Shopping, Transport, Entertainment, Groceries, Bills, Health (from MobileSync.jsx). Amount formats: `Rs.`, `Rs`, `INR`, `₹`.
- **No formal test suite.** Each task's verification = `npm run build` clean + boot + a concrete `curl`/GraphQL query showing expected JSON. Commit after each task.
- **Module shape:** each entity-owning module has Entity + DTOs (create/update, class-validator) + custom Repository + Service (business logic + computed fields) + Controller (REST, guarded) + Resolver (GraphQL).

---

## Phase 0 — Scaffold

### Task 0.1: NestJS app + config + DB connection

**Files:**
- Create: `backend/` (Nest project), `backend/.env.example`, `backend/.gitignore`
- Create: `backend/src/app.module.ts`, `backend/src/main.ts`, `backend/src/health.controller.ts`
- Create: `backend/src/database/data-source.ts`

**Interfaces:**
- Produces: booting Nest server on `PORT`; `GET /health` → `{status:'ok'}`; TypeORM connected to `DATABASE_URL`.

- [ ] **Step 1: Scaffold**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
npm i -g @nestjs/cli 2>/dev/null || true
npx @nestjs/cli new backend --package-manager npm --skip-git
cd backend
npm i @nestjs/typeorm typeorm pg @nestjs/config class-validator class-transformer
npm i @nestjs/passport passport passport-jwt @nestjs/jwt bcrypt
npm i @nestjs/graphql @nestjs/apollo @apollo/server graphql dataloader
npm i @anthropic-ai/sdk
npm i -D @types/passport-jwt @types/bcrypt
```

- [ ] **Step 2: Config + TypeORM**

`app.module.ts`: `ConfigModule.forRoot({isGlobal:true})`; `TypeOrmModule.forRootAsync` reading `DATABASE_URL`, `autoLoadEntities:true`, `synchronize:true`. `GraphQLModule.forRoot({autoSchemaFile or schema-first sdl})` — use schema-first: `typePaths:['**/*.graphql']`. Add `ValidationPipe` global in `main.ts`. `.env.example` with the 5 vars.

- [ ] **Step 3: Health route**

`GET /health` returns `{status:'ok'}` (unguarded).

- [ ] **Step 4: Verify**

```bash
cd backend && npm run build && (npm run start:dev &) && sleep 6 && curl -s localhost:3000/health
```
Expected: `{"status":"ok"}` (after a local Postgres is available; otherwise DB connect error tells us config is wired — note in commit).

- [ ] **Step 5: Commit** — `chore(backend): scaffold NestJS + TypeORM + GraphQL + config`

---

## Phase 1 — Entities + migrations + seed

### Task 1.1: Core entities (User, Account, TransactionCategory, Transaction)

**Files:**
- Create: `backend/src/users/user.entity.ts`, `backend/src/accounts/account.entity.ts`, `backend/src/categories/category.entity.ts`, `backend/src/transactions/transaction.entity.ts`

**Interfaces:**
- Produces: TypeORM entities per Section 18. `User{id,name,email(unique),password,isFirstLogin}`. `Account{id,name,type enum,balance numeric,currency,institutionName?,institutionLogo?,isConnected,includeInNetWorth,color?,lastUpdated, userId FK}`. `TransactionCategory{id,name,color?,icon?,description?,parentId?(self-FK), userId}`. `Transaction{id,date,description,amount numeric(positive),type enum,categoryId FK,accountId? FK,status enum,notes?,tags text[],attachments text[],isRecurring,recurringDetails jsonb?, userId}`.

- [ ] **Step 1: Implement** entities with enums (`AccountType`, `TxType=income|expense|transfer`, `TxStatus=pending|cleared|reconciled|void`), relations (`@ManyToOne` category/account, self-referential category parent).
- [ ] **Step 2: Verify** — `npm run build`; boot with `synchronize` creates tables (check `\dt` or logs).
- [ ] **Step 3: Commit** — `feat(backend): core entities (user, account, category, transaction)`

### Task 1.2: Planning entities (Budget, BudgetCategory, Goal, Investment, InvestmentTransaction, Notification, UserPreferences)

**Files:**
- Create entities under `budgets/`, `goals/`, `investments/`, `notifications/`, `users/` per Section 18.

**Interfaces:**
- Produces: `Budget{id,name,startDate,endDate,income, userId, categories:BudgetCategory[]}`; `BudgetCategory{id,name,allocated,categoryIds text[],color?,icon?,rollover,notes?, budgetId FK}`; `Goal{id,name,type enum,targetAmount,currentAmount,startDate,targetDate,accountId?,priority,status enum,contributionFrequency?,contributionAmount?,color?,notes?, userId}`; `Investment{id,name,ticker?,assetClass enum,type enum,shares,purchasePrice,currentPrice,purchaseDate,accountId,dividendYield?,sector?,region?,currency,notes?, userId}`; `InvestmentTransaction{id,investmentId FK,type enum,shares?,price?,amount,date,notes?}`; `Notification{id,type enum,title,body,read,createdAt, userId}`; `UserPreferences{id,currency,dateFormat,theme enum,startOfWeek enum,language, userId unique}`.
- [ ] **Step 1: Implement** all with enums + relations.
- [ ] **Step 2: Verify** — build + boot creates all tables.
- [ ] **Step 3: Commit** — `feat(backend): planning entities (budget, goal, investment, notification, preferences)`

### Task 1.3: Seed script (Indian-market data)

**Files:**
- Create: `backend/src/database/seed.ts`, add `"seed": "ts-node src/database/seed.ts"` to `package.json`.

**Interfaces:**
- Consumes: all entities.
- Produces: idempotent seed creating user **Riddhi Desai** (`riddhi@example.com`, bcrypt password `password123`), accounts (HDFC Savings 824500, ICICI Credit -12340, Zerodha 318000, Paytm 4520, Axis 142000, SBI 68000 — from `M_ACCOUNTS_FULL`), categories (Housing/Food & Dining/Transport/Utilities/Entertainment/Healthcare/Shopping/Education/Income with sub-cats from `M_CATS`), April 2026 transactions (`MT_DATA`: Salary 118000, Swiggy 649, Rent 28000, BESCOM 1840, Metro 500, Netflix 649, Myntra 3200, Apollo 820, SIP 10000, Freelance 35000, BPCL 2400), a budget "April 2026" with categories (`MB_BUDGETS`), 4 goals (`MG_GOALS`), 5 holdings (`MV_HOLDINGS`), notifications (from MobileScreens notif list).

- [ ] **Step 1: Implement** seed (clear-then-insert, wrapped in a transaction).
- [ ] **Step 2: Verify** — `npm run seed`; `curl` (after auth in later phases) or direct SQL count shows rows.
- [ ] **Step 3: Commit** — `feat(backend): seed with Riddhi sample data`

---

## Phase 2 — Auth

### Task 2.1: Auth module (register, login, refresh, JWT guard)

**Files:**
- Create: `backend/src/auth/` — `auth.module.ts`, `auth.service.ts`, `auth.controller.ts`, `jwt.strategy.ts`, `jwt-refresh.strategy.ts`, `jwt-auth.guard.ts`, `dto/register.dto.ts`, `dto/login.dto.ts`, `decorators/current-user.decorator.ts`.

**Interfaces:**
- Produces: `POST /auth/register {name,email,password}` → `{accessToken,refreshToken,user}`; `POST /auth/login` → same; `POST /auth/refresh {refreshToken}` → new tokens; `JwtAuthGuard`; `@CurrentUser()` param decorator → user id. bcrypt hash on register; sign access (`JWT_SECRET`, e.g. 15m) + refresh (`JWT_REFRESH_SECRET`, e.g. 7d).

- [ ] **Step 1: Implement** service (validate, hash, sign), strategies (extract bearer, validate user), guard, DTOs (`@IsEmail`, `@MinLength(8)`).
- [ ] **Step 2: Verify**

```bash
curl -s -XPOST localhost:3000/auth/login -H 'Content-Type: application/json' -d '{"email":"riddhi@example.com","password":"password123"}'
```
Expected: JSON with `accessToken`. A guarded route without token → 401.

- [ ] **Step 3: Commit** — `feat(backend): JWT auth (register, login, refresh, guard)`

---

## Phase 3 — CRUD modules

> Pattern per module (repeat): entity (done) → DTOs → custom repository → service → controller (guarded, scoped to `@CurrentUser()`) → resolver. Verification = `curl` create/list with a bearer token. Commit per task.

### Task 3.1: Users + Preferences
**Files:** `users/users.{module,service,controller,resolver}.ts`, `users/dto/update-user.dto.ts`, `users/dto/update-preferences.dto.ts`, `users/users.repository.ts`.
**Interfaces:** `GET /users/me` → profile; `PATCH /users/me`; `GET /users/me/preferences`; `PATCH /users/me/preferences`. Resolver: `me`, `updatePreferences`.
- [ ] Implement → [ ] Verify (`GET /users/me` with token returns Riddhi) → [ ] Commit `feat(backend): users + preferences module`

### Task 3.2: Accounts (with computed balance)
**Files:** `accounts/accounts.{module,service,controller,resolver}.ts`, `accounts/dto/*`, `accounts/accounts.repository.ts`.
**Interfaces:** CRUD `/accounts`; service exposes `balance` (stored, reconcilable from transactions) + net-worth helper (`includeInNetWorth`). Resolver mirrors.
- [ ] Implement → [ ] Verify (`GET /accounts` returns 6 seeded accounts) → [ ] Commit `feat(backend): accounts module`

### Task 3.3: Categories (parentId subcategories)
**Files:** `categories/categories.{module,service,controller,resolver}.ts`, dtos, repo.
**Interfaces:** CRUD `/categories`; nested tree via `parentId`; `GET /categories?tree=true` returns nested.
- [ ] Implement → [ ] Verify (list shows categories + sub-cats) → [ ] Commit `feat(backend): categories module`

### Task 3.4: Transactions (filter + pagination)
**Files:** `transactions/transactions.{module,service,controller,resolver}.ts`, `transactions/dto/{create,update,query}.dto.ts`, repo.
**Interfaces:** CRUD `/transactions`; `GET /transactions?type=&categoryId=&accountId=&from=&to=&page=&limit=` → `{items, total, page, limit}`. Creating/deleting updates account balance. Resolver with `category` field-resolver (DataLoader in Phase 5).
- [ ] Implement → [ ] Verify (filter by `type=expense` returns only expenses; pagination caps) → [ ] Commit `feat(backend): transactions module with filtering + pagination`

### Task 3.5: Budgets (computed totalSpent/totalAllocated)
**Files:** `budgets/budgets.{module,service,controller,resolver}.ts`, dtos, repo.
**Interfaces:** CRUD `/budgets` (+ nested budget categories); service computes `totalAllocated` (sum allocated) and `totalSpent` (sum transactions matching each category's `categoryIds` within budget date range), and per-category `spent`.
- [ ] Implement → [ ] Verify (`GET /budgets` shows April 2026 with computed totalSpent matching seeded txns) → [ ] Commit `feat(backend): budgets module with computed spend`

### Task 3.6: Goals (computed progress + projection)
**Files:** `goals/goals.{module,service,controller,resolver}.ts`, dtos, repo.
**Interfaces:** CRUD `/goals`; service computes `progressPct = currentAmount/targetAmount`, `remaining`, `projectedCompletionDate` (from `contributionAmount`/`contributionFrequency`, else null).
- [ ] Implement → [ ] Verify (Emergency Fund shows ~62%) → [ ] Commit `feat(backend): goals module with computed progress`

### Task 3.7: Investments (computed value/gain/return) + InvestmentTransactions
**Files:** `investments/investments.{module,service,controller,resolver}.ts`, `investments/investment-transactions.*`, dtos, repos.
**Interfaces:** CRUD `/investments`; computed `currentValue=shares*currentPrice`, `totalInvested=shares*purchasePrice`, `gainLoss`, `returnPercent`. `/investments/:id/transactions` CRUD for buy/sell/dividend.
- [ ] Implement → [ ] Verify (holding returns match sign of seeded data) → [ ] Commit `feat(backend): investments module with computed returns`

### Task 3.8: Notifications (mark-read)
**Files:** `notifications/notifications.{module,service,controller,resolver}.ts`, dtos, repo.
**Interfaces:** `GET /notifications` (filter `?type=&read=`); `POST /notifications/:id/read`; `POST /notifications/read-all`.
- [ ] Implement → [ ] Verify (read-all flips all `read:true`) → [ ] Commit `feat(backend): notifications module`

---

## Phase 4 — Reports, SMS, AI

### Task 4.1: Reports aggregation
**Files:** `reports/reports.{module,service,controller}.ts`, `reports/dto/period.dto.ts`.
**Interfaces:**
- `GET /reports/overview?period=1m|3m|6m|1y` → `{netIncome,savingsRate,totalIncome,totalExpenses}`.
- `GET /reports/income-vs-expense?period=6m` → `[{month,income,expense}]`.
- `GET /reports/categories?period=1m` → `[{categoryId,name,color,value,sharePct}]`.
- `GET /reports/net-worth-trend?period=6m` → `[{month,netWorth}]`.
Period → date-range helper; aggregate via query builder `GROUP BY`.
- [ ] Implement → [ ] Verify (overview totals reconcile with seeded April txns; categories share sums ~100%) → [ ] Commit `feat(backend): reports aggregation endpoints`

### Task 4.2: SMS parser
**Files:** `sms-sync/sms-sync.{module,service,controller}.ts`, `sms-sync/dto/parse.dto.ts`, `sms-sync/keyword-map.ts`.
**Interfaces:** `POST /sms-sync/parse {raw:string}` → `{merchant,amount,type,category,account,bank,last4,confidence}`. Regex: amount `(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)` (i-flag); credited/credit → income(+), debited/sent/used/spent → expense(−); bank by name match (HDFC/ICICI/Axis/SBI/Kotak…); last4 via `x{2,4}(\d{4})`/`A/c .*?(\d{4})`; merchant via `to/at ([A-Z][A-Za-z ]+)` or keyword; category via keyword map over the 9 categories; confidence from how many fields matched.
- [ ] **Step 1: Implement** parser + keyword map.
- [ ] **Step 2: Verify**

```bash
curl -s -XPOST localhost:3000/sms-sync/parse -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"raw":"Sent Rs.649.00 from HDFC Bank A/c x4521 to SWIGGY via UPI on 25-04. Ref 412..."}'
```
Expected: `{"merchant":"Swiggy"...,"amount":649,"type":"expense","category":"Food","bank":"HDFC Bank","last4":"4521","confidence":>0.8}`. Test all 4 `SYNC_DETECTED` samples.

- [ ] **Step 3: Commit** — `feat(backend): SMS parser endpoint`

### Task 4.3: AI chat proxy
**Files:** `ai-chat/ai-chat.{module,service,controller}.ts`, `ai-chat/dto/chat.dto.ts`, `ai-chat/prompt.ts`.
**Interfaces:** `POST /ai-chat {messages:[{role,text}]}` → `{reply,transaction}`. Build system prompt = `CHAT_CONTEXT` verbatim + dynamically injected live context (user's current budget totals, top categories, active goals from DB). Call Anthropic `claude-sonnet-4-6`. Parse JSON (slice first `{`→last `}`), validate shape (`reply:string`, `transaction: null | {merchant,amount,category,time}`). If `transaction` non-null, persist a Transaction (map category→categoryId, sign→type) for the current user. On Anthropic error or missing key, return `{reply: <graceful msg>, transaction:null}` (mobile still has its own localParse fallback).
- [ ] **Step 1: Implement** service with `@anthropic-ai/sdk`, prompt builder pulling live budget/goal context.
- [ ] **Step 2: Verify** (with `ANTHROPIC_API_KEY` set) — `curl` "ordered pizza for 1000" → reply + transaction persisted (`GET /transactions` shows new row). Without key → graceful `{reply,transaction:null}`, 200.
- [ ] **Step 3: Commit** — `feat(backend): AI chat proxy with live context + persistence`

---

## Phase 5 — GraphQL polish

### Task 5.1: Schema-first SDL + DataLoader
**Files:** `backend/src/**/*.graphql` (per module), `backend/src/common/dataloader/category.loader.ts`, wire loaders into request context.
**Interfaces:** Queries/mutations for all entities matching REST capability. `Transaction.category` resolved via DataLoader to batch N+1.
- [ ] **Step 1: Implement** SDL types + resolvers (most resolvers delegate to existing services) + category DataLoader.
- [ ] **Step 2: Verify** — GraphQL query `{ transactions(limit:5){ id description category{ name } } }` returns categories with a single batched category query (check logs: one `IN (...)` query, not five).
- [ ] **Step 3: Commit** — `feat(backend): GraphQL schema + DataLoader batching`

---

## Self-review notes
- Every Section-18 entity has an entity task (1.1/1.2) and a CRUD module (Phase 3).
- Every spec'd REST endpoint is covered: auth (2.1), users/prefs (3.1), accounts (3.2), categories (3.3), transactions+filter+pagination (3.4), budgets computed (3.5), goals computed (3.6), investments computed (3.7), notifications mark-read (3.8), all 4 reports (4.1), sms-sync/parse (4.2), ai-chat (4.3).
- GraphQL + DataLoader (5.1) covers the schema-first + N+1 requirement.
- Seed (1.3) covers the Indian-market data requirement.
- No placeholders: each task names exact files, endpoint shapes, and a concrete curl with expected JSON. Parser regex and computed-field formulas are specified inline.
- Auth guard requirement enforced as a Global Constraint applied to every module task.
```
