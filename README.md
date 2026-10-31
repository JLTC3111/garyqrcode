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

This is a native Next.js application for Vercel with Supabase Postgres, private Supabase Storage, and the existing Gary Supabase staff accounts. Submissions are stored in `customer_connect.customer_submissions`. The page does not automatically email or text representatives. There is no public endpoint for reading customer submissions.

## Run locally

Use Node 24.x. Install dependencies and create an untracked local environment file:

```sh
npm ci
cp .env.example .env.local
```

Fill in the four values described below. Use a separate Supabase project for development if production submissions should remain separate. Apply migrations explicitly to the selected database, then start Next.js:

```sh
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. To run the production server locally:

```sh
npm run build
npm start
```

The UI can build without credentials. Database operations and staff sign-in return an unavailable response until their runtime configuration is present. Data lives in Supabase; the application never relies on local files for persistent storage.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

The tests run the actual routes and committed migration against embedded Postgres (PGlite), without production credentials. They cover minimal anonymous feedback, conditional contact details, all service areas, validation, duplicate and concurrent submissions, request protections, storage failure, receipts, database access restrictions, staff authentication, QR version conflicts, and exported QR/icon assets. Supabase Auth and Storage HTTP responses are simulated while exercising the real SDK.

## Offline visual preview

```sh
npm run preview:offline
```

Open `outputs/customer-connect-preview.html` in a browser. This standalone file previews the short form, validation, ratings, topic chips, and conditional contact fields. It displays a preview notice and links to the running local site at `http://127.0.0.1:3000/`. Saving a submission requires the running application server and its database; the offline preview does not simulate a successful save.

## Prefill representative details

A shared link can include `rep`, `company`, `repEmail`, `repPhone`, and `repCode` query parameters. Add `service=home`, `service=job`, or `service=paperwork` (comma-separated or repeated for several) to select the service as well. Customers can still edit those details before sending. For example:

```text
/customer?rep=Jamie%20Example&company=Example%20Agency&repCode=REP-001&service=home
```

## Deploy on Vercel

1. Import this Git repository into Vercel with the repository root as Root Directory. `vercel.json` selects Next.js, `npm ci`, `npm run build`, and `.next`; `package.json` selects Node 24.x. Remove any old Vite/Cloudflare build settings in the project.
2. Configure these Vercel environment variables for each environment that needs working APIs:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Supabase **transaction pooler** connection URI, usually port 6543, using the `postgres` role. URL-encode the password and include `sslmode=require`. |
   | `SUPABASE_URL` | The existing Gary Auth project's HTTPS URL. |
   | `SUPABASE_PUBLISHABLE_KEY` | Its publishable key or legacy `anon` key, used for staff authentication and membership checks. |
   | `SUPABASE_SECRET_KEY` | Its server-only secret key, used exclusively for private QR Storage. Legacy `SUPABASE_SERVICE_ROLE_KEY` is also supported. |

3. With the target database's `DATABASE_URL` in a trusted local environment, run `npm run db:migrate` once before accepting submissions. It reads `.env.local`, applies `supabase/migrations/*.sql` in a transaction, and tracks filenames/checksums in `customer_connect.schema_migrations`. Repeated runs skip completed migrations; add a new migration instead of editing an applied file. Use this command consistently for this app's migrations, rather than mixing it with Supabase CLI migration tracking on the shared project.
4. Deploy through Vercel and check `/`, `/customer`, `/staff`, and a real submission and staff QR save. After changing environment variables, redeploy to apply them. Use a separate database for previews if preview submissions should not reach production.

The migration creates a private `customer_connect` schema and the private `customer-connect-qr` bucket. RLS and revoked public grants keep submissions and editor records out of the browser Data API. A restrictive Storage policy prevents existing broad policies from granting browser access to this bucket. Existing Gary Auth users and team membership policies are untouched. Never prefix the database URL or server secret with `NEXT_PUBLIC_`, or put a server secret in the publishable-key field.

No Cloudflare account, Worker bindings, Wrangler, or Vite output is required. The former D1 SQL files in `drizzle/` are retained only as historical references; they are not applied to Postgres. Existing D1 rows and R2 objects are **not copied automatically**: export/import any required data before cutover, converting Unix-second dates to Postgres timestamps, parsing JSON fields, and preserving QR asset keys in the new bucket. A fresh database shows the bundled default QR until staff save a replacement.

Setup references: [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build), [Supabase pooled Drizzle connections](https://supabase.com/docs/guides/database/drizzle), and [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

## English, Vietnamese, and dark appearance

The EN / VI switch translates the complete form, validation messages, help, information-use notice, and downloaded summaries. The sun/moon button switches appearance. Preferences persist, and switching preserves entered answers. Shared URLs may set `?lang=vi&theme=dark`; saved preferences and browser settings provide the fallback.

The Gary network links open `https://garyhome.vn`, `https://visa.garyhome.vn`, and `https://jobs.garyhome.vn` in separate tabs.

## Staff QR management

`/staff` uses the existing Gary Home Supabase accounts. It verifies the current user with Supabase Auth and then reads the user's active `team_members` membership through the existing RLS policy before every protected operation. Active owner, admin, manager, and editor accounts can manage the QR. Customer accounts, inactive accounts, expired sessions, and user-editable metadata do not grant access. MFA-enabled accounts must complete verification.

Staff can generate a branded QR for an HTTPS destination or upload a PNG QR image up to 1 MB. Images are stored in the private Supabase `customer-connect-qr` bucket; the current pointer and last editor are stored in `customer_connect.site_qr_codes`. Public endpoints expose the current QR image and destination, not staff details. Version checks prevent simultaneous edits from silently overwriting each other. Previous image objects are retained; failed competing saves clean up their unused uploads.

The QR card on the customer page loads the latest saved code. Updating the image affects subsequent page loads and downloads; it does not alter QR codes already printed or downloaded.

Configure the runtime variables and migration described above. Staff authorization continues to use the user's token and the public key; the server secret is used only for Storage after authorization. Real staff sign-in and hosted QR replacement require configured credentials and deployment to verify.

## QR and icon files

- QR: `public/qr/customer-connect.svg` and `public/qr/customer-connect.png`.
- Desktop: `public/favicon.svg`, `public/favicon.ico`, and 16/32/48-pixel PNGs in `public/icons/`.
- Mobile: `public/icons/apple-touch-icon.png` (180), `android-chrome-192.png`, and `android-chrome-512.png`.
- Installation metadata: `public/site.webmanifest`.

`npm run assets:generate` regenerates the assets using the checked-in QR encoder and pinned Sharp dependency. The default QR points to `DEFAULT_QR_DESTINATION` in `lib/qr.ts`; update that destination and regenerate assets if the published customer URL changes. The exported PNG is decoded in the test suite, including its quiet zone, format bits, and Reed-Solomon parity.

The offline preview command also creates `outputs/staff-preview.html` to inspect the bilingual sign-in screen. It cannot sign in to the undeployed application.

## Shared services menu

Customer Connect uses the centrally released Gary apps menu from Home, with a local fallback for unavailable shared assets. Language and theme follow the form, all service links open their external sites, and mobile taps remain active through touch blur. See [`shared/gary-apps/README.md`](shared/gary-apps/README.md) for update and fallback behavior.
