# Activity feed

Activity shows what people have done in Macro: a year-long heatmap of daily actions, a Most active list of the entities the user works on most, and a feed of actions grouped by day ("You edited Doc X 5 times · 2h"). The feed has two views: You, the user's own actions, and Team, teammates' actions on items the user can see. Only the user's own activity is shown in You; Team shows each row's actor. The page pages in more history as the user scrolls and refreshes live when actions happen in another tab.

## Sub-features

- `act-heatmap` shows a year-long grid of daily action counts with a legend and four stats.
- `act-most-active` lists the most-used entities as pill chips; click opens the entity, shift-click opens it in a new split.
- `act-feed` lists actions newest first, grouped under day headers with a compact relative time.
- `act-fold` folds repeated same-actor, same-entity, same-action events in a day into one line with a count.
- `act-scope` switches between the You and Team views; the choice survives reloads.
- `act-paging` loads more rows automatically near the bottom; a failed page shows `Retry`.
- `act-live` refreshes the feed, heatmap, and counts after actions, including after reconnect.
- `act-databases` lists database create, rename, trash, restore, and write actions when Databases is on.

## How to get to it (user POV)

- Sidebar `More`, then `Activity` (it can be pinned to the rail with `Customize sidebar`).
- Keyboard: `g` then `y` from outside an editor.
- Direct URL `/app/activity`.
- Activity appears only when its feature flag is on; with the flag off the page redirects to Home.
- Phones: the same page via the More menu; the list rests below the floating title.

## Driving it with chrome-devtools MCP

Preconditions:

- Signed in (email-code sign-in; see the agent guide's login page) with the Activity feature flag enabled, and GraphQL Soup enabled as the activity page depends on it.
- The account has made several actions (create, edit) in the last day, and a teammate has at least one action on a shared item for Team.
- No other Activity tab is open at `/app/activity`.

- **Open.** `navigate_page` to `/app/activity`, then `take_snapshot`. The heatmap card, the `Most active` header, and the feed rows appear; `You` is selected.
- **Switch to Team.** `click` the tab `Team`. The feed reloads at the top and each row names its actor. Switch back with `click` `You`.
- **Open an entity.** `click` a `Most active` chip. The entity opens in the current split. Shift-click another chip to open it in a new split.
- **Scroll.** Scroll the feed to the bottom. A `Loading…` tail appears and the next page loads automatically; no `Show more` button exists.
- **Live update.** In a second tab, edit a document the user owns. Back in Activity, the new row appears at the top without reload, and the heatmap cell for today increases.
- **Fold.** Make five quick edits to one document in one day. The feed shows one row `You edited <doc> 5 times`.
- **Proof.** Save the snapshot to a file (the heatmap alone produces hundreds of nodes) and `take_screenshot`. Proof shows the active tab, the Most active chips, and the first feed rows.

## Gotchas

- The heatmap is one accessibility node per day; save the snapshot to a file and grep it rather than reading it inline.
- Activity pages are bounded. A Team page can add few rows or none; the list keeps loading until rows appear or history ends.
- Hidden tabs defer refresh until they are visible again.
- The same entity can appear in You and Team with different rows; the You feed never shows teammates.
- Edits are recorded as one activity per editing session; typing for five minutes adds one event, not one per save.
- Opening or closing a document without edits adds no activity.
- With Databases on, database writes appear as `You created/edited/deleted <database>` and open the database.
- Home's merged feed reads Activity's recent items, so an Activity row can appear in Home without an Activity visit.
