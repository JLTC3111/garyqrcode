# Shared Gary apps menu

Customer Connect loads the same centrally released menu as Home, Jobs and Visa from `https://garyhome.vn/shared/gary-apps/v1/manifest.json`. The canonical catalogue, component and base styles are maintained in Gary Home's `shared/gary-apps/`. A shared update requires publishing Home, after this Customer Connect integration has been deployed once. For the initial rollout, publish Home's current component (including the mobile tap fix) before publishing Customer Connect.

`components/service-apps.tsx` exports `CustomerServiceAppsMenu`, used by `CustomerIntake`. It follows the form's current English/Vietnamese language. Customer Connect is separate from Home, Jobs and Visa, so `currentApp` is deliberately omitted: every service link uses its full external address and opens a new tab with `noopener noreferrer`.

`client.js` and `client.d.ts` are the stable v1 protocol adapter copied from Home. They load matching, release-scoped JS/CSS, share requests across mounts, check for updates every 60 seconds and when returning to the tab, and defer replacement while the menu is open or focused. Routine component edits are made in Home; protocol adapter changes must be synced deliberately.

The existing local catalogue, React component and base stylesheet remain an offline fallback snapshot. The fallback stays useful in server-rendered HTML and during a failed first load. A failed later refresh retains the last working shared release. Both shared and fallback menus keep links available after touch blur with no focus destination; known outside focus, Escape, outside taps and following a link still close the menu.

`app/layout.tsx` loads the fallback base stylesheet before `app/quick-feedback.css`. Customer Connect's more specific selectors preserve its light/dark palette, readable menu typography and fixed mobile panel when the shared release's stylesheet loads later. The compact mobile trigger retains its accessible label. Language/theme changes update the menu without remounting the form or discarding entered answers.

The runtime shares no account state, form answers or credentials. Loading a release needs no new dependency, database migration or environment variable. The protocol adapter's manifest fetch omits credentials. The offline preview also includes the local fallback and can load the central release when the network is available.
