# FoodWise – Smart Food & Expiry Manager

**Eat Before It Expires. Save Food. Save Money.**

FoodWise is a small, framework-free web app for tracking the food in your kitchen. It helps you spot ingredients that should be used soon, keep an inventory, and record food you have eaten or thrown away.

## The problem and who it helps

Food is easy to forget at the back of a fridge or cupboard. FoodWise makes expiry dates visible and sorts active food by the date it should be used. It is designed for students, people living alone, working adults, and families who want a simple way to manage food at home.

## Features

- Dashboard with live active, expiring soon, expired, and consumed counts.
- Add, edit, search, filter, sort, and permanently delete inventory items.
- Fresh, expiring soon (today through three days), and expired status labels.
- A “Use it first” list sorted by the earliest expiry date, with a quick consumed action.
- Consumed and wasted history, a comparison chart, and estimated waste value where a price was recorded.
- Realistic demo data and a reset control. Demo data is appended only after confirmation when records already exist.
- Responsive desktop, tablet, and mobile navigation.
- English and Thai interface with a language selector; the selected language is remembered in `foodwise-language-v1`.
- Noodles & Pasta category for instant noodles, other noodles, and pasta.
- Form validation and browser confirmation for destructive actions.

## Technologies

- HTML5
- CSS3
- Vanilla JavaScript (no framework or build step)
- Supabase PostgreSQL for authenticated food inventory and history
- Browser LocalStorage reserved for the existing, untouched `foodwise-data-v1` source data and Supabase Auth session storage
- Supabase JavaScript client v2 for email authentication

The page loads DM Sans, Manrope, and Supabase JS v2 from CDNs when an internet connection is available; system fonts remain available as a fallback.

## Run FoodWise

1. Download or copy this project folder to your computer.
2. Add your Supabase Project URL and Publishable key to `supabase-config.js` (see **Supabase email authentication** below).
3. From this folder, start a local web server: `python -m http.server 8000`.
4. Open `http://localhost:8000` in a recent version of Chrome, Edge, Firefox, or Safari, then create an account or sign in.
5. Select **Load demo data** and confirm to add realistic sample records to the signed-in account's cloud data, then try the app sections and item actions.

No package installation is needed. FoodWise must be opened through localhost or a hosted web origin for authentication redirects and browser requests; do not open `index.html` as a `file://` URL.

## Supabase email authentication

`supabase-config.js` is the separate browser configuration file. Set `projectUrl` to the Supabase Project URL and `publishableKey` to the Supabase Publishable key. These are the only Supabase configuration values used by the frontend. Never place a secret or service-role key in this file.

Enable email authentication in Supabase Auth and set the local development Site URL/redirect allowlist to the origin you use, such as `http://localhost:8000`. If email confirmation is enabled, new users must follow the confirmation link before signing in. Phone authentication is not enabled by FoodWise.

Food inventory and history are stored in Supabase for the signed-in user. The existing `foodwise-data-v1` value is not loaded, changed, or imported. Local data migration requires a separate, explicit Phase 2B flow and is not implemented here.

## How LocalStorage works

Existing records may remain in the browser key `foodwise-data-v1` from the earlier local-only version. Phase 2A does not read, overwrite, delete, or migrate that value. It loads authenticated cloud data only after checking the current Supabase user, and the UI explicitly notes that local data has not been imported. Use **Reset all data** only if you intend to permanently delete the signed-in account's cloud inventory and history; the app asks for confirmation first.

Each active food record contains an ID, name, category, numeric quantity, unit, optional purchase date and price, expiry date, and a status snapshot. The UI derives status from the expiry date each time it renders, so the status remains current as days pass. History records retain a copy of the item, its consumed/wasted outcome, and the date recorded. Category values remain English in Supabase (including `Noodles & Pasta`); the interface translates their display labels according to the selected language. User-entered food names are not translated. The language preference uses a separate `foodwise-language-v1` LocalStorage key; inventory data is not modified by changing languages.

## Project structure

```text
foodwise/
├── index.html   # App structure and accessible controls
├── styles.css   # Responsive visual design
├── app.js       # Authenticated Supabase data access, validation, and rendering
├── supabase-config.js # Public Supabase Project URL and Publishable key
└── README.md    # Setup and project guide
```

## Date handling

Expiry dates are parsed as local calendar dates (`year, month, day`) and compared at local midnight. The app does not parse date-only strings as UTC, which avoids the common one-day shift across time zones. Yesterday is expired, today through three days ahead is expiring soon, and four or more days ahead is fresh.

## Testing and demonstration

The requested demonstration scenarios are covered by the built-in controls: add/edit/delete, search/category/status filters, expiry sorting, consumed/wasted actions, summary updates, refresh persistence, empty states, form errors, and responsive breakpoints. Date boundary behavior is derived from the same date-only helper used by dashboard, inventory, and “Use it first.”

Before presenting, test in two separate accounts: add, edit, and delete an item; search and filter; mark one item consumed and another wasted; refresh and confirm persistence; then use **Reset all data** only with disposable test-account data. Switch between accounts and confirm each sees only its own records. Test desktop and narrow mobile widths. Check a date due today and dates three and four days away if you want to demonstrate status boundaries. Local migration is intentionally deferred to Phase 2B.

## Limitations

- `foodwise-data-v1` is preserved but not imported. Phase 2B must provide a user-confirmed, retry-safe migration before those legacy records are available in the cloud.
- Food inventory and history require a working network connection and the authenticated Supabase account. The database RLS policies are essential to account isolation.
- Waste value is an estimate based only on recorded purchase prices for wasted items; missing prices are treated as zero.
- The comparison chart summarizes recorded item counts, not portion sizes or actual environmental impact.



**Live Website:** https://kanthinan.github.io/foodwise/
