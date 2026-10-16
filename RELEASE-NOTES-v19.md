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

## Install banner (added with v19)
- A banner at the top of Today offers to add My Buddy to the home screen.
- Chrome, Edge and Android show an **Install app** button. iPhone and iPad show four steps for Safari,
  and a **Copy app link** button.
- It hides once the app is installed, after **Dismiss** (for 14 days), and on desktop browsers that
  cannot install the app.

## Icon picker (added with v19)
- The icon is chosen from a dropdown. It shows the current icon, and opens a panel of 50 icons plus a box
  to type your own emoji. It closes after a pick, on a click elsewhere, or with Escape.

## Navigation (added with v19)
- **Week** moved out of the sidebar. It is a button in Today's header, next to Previous, Today and Next.
- **Spending** sits directly after **Notes** in the sidebar. Student and Work follow it when they are on.
