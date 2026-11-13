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
- Form validation and browser confirmation for destructive actions.

## Technologies

- HTML5
- CSS3
- Vanilla JavaScript (no framework or build step)
- Browser LocalStorage
- Supabase JavaScript client v2 for email authentication

The page loads DM Sans, Manrope, and Supabase JS v2 from CDNs when an internet connection is available; system fonts remain available as a fallback.

## Run FoodWise

1. Download or copy this project folder to your computer.
2. Add your Supabase Project URL and Publishable key to `supabase-config.js` (see **Supabase email authentication** below).
3. From this folder, start a local web server: `python -m http.server 8000`.
4. Open `http://localhost:8000` in a recent version of Chrome, Edge, Firefox, or Safari, then create an account or sign in.
5. Select **Load demo data** to add realistic sample inventory and try the app sections and item actions.

No package installation is needed. FoodWise must be opened through localhost or a hosted web origin for authentication redirects and browser requests; do not open `index.html` as a `file://` URL.

## Supabase email authentication

`supabase-config.js` is the separate browser configuration file. Set `projectUrl` to the Supabase Project URL and `publishableKey` to the Supabase Publishable key. These are the only Supabase configuration values used by the frontend. Never place a secret or service-role key in this file.

Enable email authentication in Supabase Auth and set the local development Site URL/redirect allowlist to the origin you use, such as `http://localhost:8000`. If email confirmation is enabled, new users must follow the confirmation link before signing in. Phone authentication is not enabled by FoodWise.

This phase adds authentication only. Food inventory and history continue using the existing `foodwise-data-v1` LocalStorage behavior; food CRUD and migration to Supabase are not connected yet.

## How LocalStorage works

FoodWise saves records under the browser key `foodwise-data-v1`. Active items and historical outcomes are stored separately. Changes are saved as they happen and restored when the same browser opens the app again. Data stays in that browser profile on that device; it is not synced or sent to a server. Clearing browser site data removes it. Use **Reset all data** to clear FoodWise records from inside the app after confirming.

Each active food record contains an ID, name, category, numeric quantity, unit, optional purchase date and price, expiry date, and a status snapshot. The UI derives status from the expiry date each time it renders, so the status remains current as days pass. History records retain a copy of the item, its consumed/wasted outcome, and the date recorded.

## Project structure

```text
foodwise/
├── index.html   # App structure and accessible controls
├── styles.css   # Responsive visual design
├── app.js       # Validation, expiry logic, rendering, and LocalStorage
└── README.md    # Setup and project guide
```

## Date handling

Expiry dates are parsed as local calendar dates (`year, month, day`) and compared at local midnight. The app does not parse date-only strings as UTC, which avoids the common one-day shift across time zones. Yesterday is expired, today through three days ahead is expiring soon, and four or more days ahead is fresh.

## Testing and demonstration

The requested demonstration scenarios are covered by the built-in controls: add/edit/delete, search/category/status filters, expiry sorting, consumed/wasted actions, summary updates, refresh persistence, empty states, form errors, and responsive breakpoints. Date boundary behavior is derived from the same date-only helper used by dashboard, inventory, and “Use it first.”

Before presenting, open the app at desktop width and at a narrow mobile width; load demo data; inspect all four sections; edit an item; search and filter; mark one item consumed and another wasted; refresh and confirm records remain; then reset data and confirm the empty states. Check a date due today and dates three and four days away if you want to demonstrate status boundaries.

## Limitations

- Data is local to one browser profile and is not backed up or synchronized.
- Phase 1 adds email authentication only; inventory CRUD and history still use the existing browser-wide LocalStorage key and are not yet separated by authenticated user. Supabase food storage and migration are future phases.
- Waste value is an estimate based only on recorded purchase prices for wasted items; missing prices are treated as zero.
- The comparison chart summarizes recorded item counts, not portion sizes or actual environmental impact.
