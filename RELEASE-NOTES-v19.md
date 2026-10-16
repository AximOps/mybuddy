# My Buddy web v19: speed

## Before you deploy
- **No database migration** is needed for this release.
- Redeploy on Vercel. The new `vercel.json` sets the app to run in **Singapore (`sin1`)**, next to the
  Neon database. Before this change, each database call crossed from Washington to Singapore, and a
  single page click made many of them one after another. This is the biggest speed change.

## What changed
- **App runs next to the database.** `vercel.json` sets the region to `sin1`.
- **Signed-in user looked up once per request.** The session check is shared by the layout and pages.
- **One database transaction for the app shell.** Settings and the admin flag load together.
- **One fewer database round trip** each time a transaction starts.
- **Instant feedback on click.** The page area shows a loading skeleton straight away, and the sidebar
  item you clicked shows a small spinner until the page is ready.
- **Smaller client code.** Icons are imported individually (`optimizePackageImports`).

## How to check
- Vercel → Speed Insights: compare page load times for `/today`, `/tasks` and `/stats` against the
  previous deployment after a few days of traffic.
- Click through Today → To-Do → Notes → Stats on a phone and a laptop. The spinner should appear at once,
  and the page should follow quickly.
