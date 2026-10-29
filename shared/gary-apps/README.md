# Shared Gary apps menu

The catalogue, React components, and base stylesheet are copied unchanged from [JLTC3111/garyhome](https://github.com/JLTC3111/garyhome/tree/7204a797a56d1fd0301c570253d2a7cf8f178919/shared/gary-apps), introduced in commit `7204a797a56d1fd0301c570253d2a7cf8f178919`.

`CustomerIntake` renders `GaryAppsMenu` in its header using the page's current English/Vietnamese locale. The feedback site is separate from Home, Jobs, and Visa, so `currentApp` is intentionally omitted: every service link uses its full external address and opens a new tab.

`app/layout.tsx` loads the base stylesheet before `app/quick-feedback.css`. The latter supplies the page's light/dark palette, readable menu typography, and a fixed mobile panel below the header. The compact mobile trigger retains its accessible label. The offline preview loads the same styles in the same order.

The shared component handles Escape, arrow keys, Home/End, outside clicks, and focus leaving the menu. It performs no network requests, shares no account state, and adds no dependencies.
