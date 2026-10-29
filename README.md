# Gary · Customer Connect

A dedicated, responsive customer page for housing, employment, and paperwork assistance. Available at `/` and `/customer`.

Customers can share feedback, request assistance, or do both on one compact page designed for a one- to two-minute visit. The form supports:

- Three required feedback answers: representative name, service area, and one overall star rating.
- Hovering previews every star up to the pointer; leaving restores the clicked rating. Tabs, choices, buttons, and links have hover feedback, with reduced-motion support.
- Optional feedback topic chips and a short comment.
- Optional representative agency, contact details, and ID in a collapsed section.
- Anonymous feedback by default. A single email or phone field appears for requested follow-up or assistance; customer name stays optional.
- One Send button with a short information-use notice. Assistance requests also require a short description of the help needed.
- Database-backed submissions, retry protection, reference numbers, and downloadable summaries.

Submissions are stored in the D1 `customer_submissions` table. The page does not automatically email or text representatives. There is no public endpoint for reading customer submissions.

## Run locally

Use Node 24 or later for the included SQLite-backed tests. Install dependencies with `npm ci`.

Build once to produce the local D1 configuration:

```sh
npm run build
```

Apply the initial migration once to a fresh local database:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_absent_bucky.sql
```

Then start the application:

```sh
npm run dev
```

Use the printed local address. `npm start` runs the built Worker instead. Both use the checkout-local database. Hosted deployments use a separate D1 database and apply the committed migration during deployment.

## Verification

```sh
npm run typecheck
npm test
npm run build
```

The tests run the actual submission route and migration against an in-memory SQLite database through a D1-compatible adapter. They cover minimal anonymous feedback, optional topics, conditional follow-up details, all service areas, validation, duplicate and concurrent submissions, request protections, storage failure, and receipt contents. Staff QR tests cover authenticated access, image storage, version conflicts, and exported QR/icon assets.

## Offline visual preview

```sh
npm run preview:offline
```

Open `outputs/customer-connect-preview.html` in a browser. This standalone file previews the short form, validation, ratings, topic chips, and conditional contact fields. It displays a preview notice and links to the running local site at `http://127.0.0.1:5173/`. Saving a submission requires the running application server and its database; the offline preview does not simulate a successful save.

## Prefill representative details

A shared link can include `rep`, `company`, `repEmail`, `repPhone`, and `repCode` query parameters. Add `service=home`, `service=job`, or `service=paperwork` (comma-separated or repeated for several) to select the service as well. Customers can still edit those details before sending. For example:

```text
/customer?rep=Jamie%20Example&company=Example%20Agency&repCode=REP-001&service=home
```

## Hosting status

D1 and R2 bindings (`DB` and `BUCKET`) and the Sites project id are retained in `.openai/hosting.json` for the supported source publishing workflow. The existing local configuration in `vite.config.ts` mirrors these values. The build writes the deployment manifest to `dist/.openai/hosting.json` and copies database migrations beside it. The Site starts private. Hosted publication remains blocked because `git.chatgpt-team.site` could not be resolved by the source workflow.

The running local preview at `http://127.0.0.1:5173/` has both existing migrations applied. A real browser submission was saved and confirmed in its local database. A fresh checkout must still apply both migrations before submissions or staff QR saves will work. Hosted deployment applies migrations separately.

Publish the existing Site through the Sites workflow when source repository access is available. Keep the project id in `vite.config.ts` and the private audience unless a different audience is explicitly requested.

## English, Vietnamese, and dark appearance

The EN / VI switch translates the complete form, validation messages, help, information-use notice, and downloaded summaries. The sun/moon button switches appearance. Preferences persist, and switching preserves entered answers. Shared URLs may set `?lang=vi&theme=dark`; saved preferences and browser settings provide the fallback.

The Gary network links open `https://garyhome.vn`, `https://visa.garyhome.vn`, and `https://agency.garyhome.vn` in separate tabs.

## Staff QR management

`/staff` uses the existing Gary Home Supabase accounts. It verifies the current user with Supabase Auth and then reads the user's active `team_members` membership through the existing RLS policy before every protected operation. Active owner, admin, manager, and editor accounts can manage the QR. Customer accounts, inactive accounts, expired sessions, and user-editable metadata do not grant access. MFA-enabled accounts must complete verification.

Staff can generate a branded QR for an HTTPS destination or upload a PNG QR image up to 1 MB. Images are stored in the private R2 `BUCKET`; the current pointer and last editor are stored in D1 `site_qr_codes`. Public endpoints expose the QR image and destination, not staff details. Version checks prevent simultaneous edits from silently overwriting each other. Previous image objects are retained.

The QR card on the customer page loads the latest saved code. Updating the image affects subsequent page loads and downloads; it does not alter QR codes already printed or downloaded.

Configure `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in the site's runtime environment. These have been set for the existing Gary project; publishing is required to apply them. No service key is used, and no existing Gary users or roles were modified. For local Worker development, use an untracked `.dev.vars` file. Never place a Supabase secret or service-role key in the publishable-key field.

On a fresh local database, also apply `drizzle/0001_peaceful_stick.sql` after the initial migration. The migrations and protected API are tested against an in-memory database and simulated Auth responses. Real staff sign-in and hosted QR replacement remain unverified until deployment.

## QR and icon files

- QR: `public/qr/customer-connect.svg` and `public/qr/customer-connect.png`.
- Desktop: `public/favicon.svg`, `public/favicon.ico`, and 16/32/48-pixel PNGs in `public/icons/`.
- Mobile: `public/icons/apple-touch-icon.png` (180), `android-chrome-192.png`, and `android-chrome-512.png`.
- Installation metadata: `public/site.webmanifest`.

`npm run assets:generate` regenerates the assets using the checked-in QR encoder and the Sharp dependency included by the pinned build toolchain. The default QR points to the intended published customer URL. That URL is not live yet. The exported PNG is decoded in the test suite, including its quiet zone, format bits, and Reed-Solomon parity.

The offline preview command also creates `outputs/staff-preview.html` to inspect the bilingual sign-in screen. It cannot sign in to the undeployed application.
# garyqrcode
