# Chai Chokadi POS

Billing, offers, stock and sales analytics for a Navratri food stall.
Four devices (phones, tablets or laptops) share one website: counter staff bill customers,
the owner sees sales, stock and offers.

- **Frontend**: Angular 20 (`frontend/`)
- **Backend**: NestJS 11 + Prisma (`backend/`), serves the API under `/api` and the built frontend
- **Database**: PostgreSQL 16
- **Deploy**: one Docker image (`Dockerfile`) on Render, database on Neon (both free tiers)

Payments are not processed by the app. Online payments use your own UPI QR; staff confirm
"Payment received" after checking their phone. Every bill (cash or online) is recorded.

---

## Features

| Area | What it does |
| --- | --- |
| Counter | Home (welcome, ⭐ Chokadi Favourites, numbered combos, offer banners), photo menu by category, search, combos (fixed or "pick any N"), live cart total with offers applied; phones get a bottom nav and a "View cart" button |
| Checkout | Customer name + mobile (returning customers autofill) → bill → Cash (change calculator) or Online (your QR) |
| Bills | Any day's bills; a **To serve** queue with a tick per bill (paid or pending) to confirm it was handed over, who served it and when; take payment later or cancel; refreshes every 20 s so all devices stay in sync |
| Offers | % off, flat ₹ off, buy X get Y; per item, category or whole bill; min quantity, min bill, "upto ₹" cap, start/end time |
| Stock | Add / waste / count per item, low-stock alerts, "prepare for tomorrow" forecast from recent sales |
| Dashboard | Sales per day (cash vs online), busiest hours, top/slow sellers, categories, offer impact, customers, CSV export |
| Staff | Counter logins, reset password, disable (signs them out everywhere) |

Look and feel: dark-wood base with cream cards, chai-orange actions, red price pills and the Chai Chokadi logo.
Fonts (Poppins, Kaushan Script) are bundled with the app, so it looks the same offline.
Choose which items appear under **Favourites** with the ⭐ checkbox in Menu → Edit item.
Offer banners on the counter are generated from the active offers in Offers.

Business rules worth knowing:

- Money is stored in paise (integers). Percentage discounts round to whole rupees.
- The business day runs until **5 am** India time, so late-night sales count for the right night.
- Each item gets its single best item/category offer; then one whole-bill offer applies to the rest.
- Prices, names and discounts are snapshotted on each bill, so editing the menu never changes past bills.
- A bill is created once per checkout even if "Take payment" is tapped twice or the network retries.

---

## Local development

Requirements: Node 20.19+ and PostgreSQL 16 (Homebrew or Docker).

```bash
# 1. Database (skip if you already have Postgres running)
createdb stall            # or: docker compose up -d db

# 2. Backend
cd backend
cp .env.example .env      # set DATABASE_URL, JWT_SECRET (openssl rand -hex 32), ADMIN_PASSWORD
npm ci
npx prisma migrate deploy
npm run seed:menu         # optional: loads the Chai Chokadi menu with photos
npm run start:dev         # http://localhost:3000/api

# 3. Frontend (second terminal)
cd frontend
npm ci
npx ng serve              # http://localhost:4200  (proxies /api to :3000)
```

The admin account is created automatically on first start from `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

Useful commands (in `backend/`):

| Command | Purpose |
| --- | --- |
| `npm test` | Unit tests (pricing/offers engine, stock forecast, analytics, config) |
| `npm run lint` | ESLint (auto-fixes) |
| `npm run build:web` | Build Angular into `backend/public` so the API serves it on :3000 |
| `npm run seed:menu` | Load the menu into an **empty** database |

---

## Deploying (free: Render + Neon)

### 1. Put the code on GitHub

```bash
git init && git add . && git commit -m "Chai Chokadi POS"
# create an empty private repo on github.com, then:
git remote add origin https://github.com/<you>/chai-chokadi-pos.git
git push -u origin main
```

`.env` files are git-ignored. Never commit real passwords.

### 2. Create the database on Neon

1. Sign up at neon.tech → **New project** → region **Asia Pacific (Singapore)**.
2. Open **Connection details**, turn **off** "Connection pooling", copy the connection string.
3. Add `&connect_timeout=15` to the end (the free database sleeps and needs a moment to wake).

It looks like:
`postgresql://user:password@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&connect_timeout=15`

### 3. Create the web service on Render

1. Sign up at render.com → **New → Blueprint** → pick your GitHub repo. It reads `render.yaml`.
2. When asked, fill in:
   - `DATABASE_URL`: the Neon string from step 2
   - `ADMIN_PASSWORD`: a strong password (8+ characters) for the owner login
3. `JWT_SECRET` is generated for you. Click **Apply**.

The first build takes about 5 minutes. On start the container applies database migrations
and creates the admin account. Open `https://<service-name>.onrender.com`.

### 4. Load the menu (once)

From your laptop, pointing at the Neon database:

```bash
cd backend
DATABASE_URL="<neon connection string>" npm run seed:menu
```

Or skip this and add the menu by hand in **Menu**.

### 5. Set up the stall

1. Sign in as `admin` → **Settings**: upload your UPI QR, set the UPI ID.
2. **Staff**: create one login per counter device.
3. **Menu**: tick "Track stock" on items you want to count; **Stock**: enter opening quantities.
4. On each phone, open the site and use **Add to Home Screen**. It opens like an app.

### 6. Keep it awake (important on the free plan)

Render's free service sleeps after 15 minutes idle; the first request then takes 30–60 seconds.

1. Sign up at uptimerobot.com → **New monitor** → HTTP(s).
2. URL: `https://<service-name>.onrender.com/api/health`, interval **5 minutes**.

This keeps both the app and the database warm. Also open the app 10 minutes before opening the stall.

---

## During the festival

- **Every night**: Dashboard → **Download bills (CSV)**. It's your offline backup.
- **Serving**: tick each bill in **Bills → To serve** as it's handed over (or tap **Served now** after payment).
  Served bills can't be cancelled.
- **Pending bills**: before closing, open **Bills** and settle or cancel anything pending
  (pending bills are not counted in sales).
- **Prepare for tomorrow**: Stock page, choose Normal / Busy / Peak.
- **Lost phone or staff leaving**: Staff → Disable. They're signed out immediately.

### No internet at the stall? (fallback)

Run everything on a laptop and connect the other devices to the same Wi-Fi or hotspot:

```bash
# in the project root, create .env with:
#   JWT_SECRET=<openssl rand -hex 32>
#   ADMIN_PASSWORD=<strong password>
docker compose up -d --build
```

Other devices open `http://<laptop-ip>:3000` (find the IP in the laptop's Wi-Fi settings).
This uses a separate local database; export CSVs from both if you switch mid-festival.

---

## Configuration

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `JWT_SECRET` | yes | 32+ random characters; the app refuses to start with a weak one |
| `ADMIN_USERNAME` | no | Default `admin`; used only when the database has no users |
| `ADMIN_PASSWORD` | first boot | 8+ characters in production; used only when the database has no users |
| `PORT` | no | Default `3000` |
| `CORS_ORIGIN` | no | Only if the frontend is hosted on a different domain |
| `NODE_ENV` | no | `production` enables stricter checks and quieter logs |

## Security notes

- Passwords are bcrypt-hashed; logins are rate-limited (20/min per IP).
- Sessions last 16 hours; disabling a user takes effect on their next request.
- Security headers via Helmet (CSP, HSTS, no framing); request bodies capped at 256 KB.
- Admin-only endpoints are enforced on the server, not just hidden in the UI.
- Uploaded images are stored in the database (free hosts have no persistent disk), max 2 MB, PNG/JPEG/WebP only.
