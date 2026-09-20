# Setup & Deploy Guide

This registry is a static site (`index.html`, `style.css`, `script.js`) hosted on
GitHub Pages. It reads and writes to a Google Sheet through a small Google Apps
Script "web app," which acts as the API in between since GitHub Pages can't run
server code.

```
Browser (GitHub Pages site)  <--fetch()-->  Apps Script Web App  <--reads/writes-->  Google Sheet
```

You'll do five things, in order:

1. Create the Google Sheet.
2. Create the Apps Script project and deploy it as a web app.
3. Paste the web app URL into `script.js`.
4. Push the site to GitHub and turn on GitHub Pages.
5. Learn the (one) extra step needed any time you edit the script later.

No coding experience needed — every step below is click-by-click.

---

## Part 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and click **Blank** to
   create a new spreadsheet. Rename it at the top-left, e.g. "Moving-In
   Registry."
2. Import the provided template so you don't have to type headers by hand:
   - **File → Import**
   - Click the **Upload** tab and upload `sheet-template.csv` from this repo.
   - For "Import location," choose **Replace current sheet**.
   - Click **Import data**.
3. Rename the tab to `items` (the API code expects this exact name):
   - Double-click the tab name at the bottom-left (it currently says "Sheet1").
   - Type `items` and press Enter.
4. Make the `claimed` column a real checkbox (column H):
   - Click the column **H** header to select the whole column, then click
     again to select rows 2 and below if you'd rather not touch row 1.
   - Go to **Insert → Checkbox** (in some Sheets versions this is under
     **Data → Data validation → Criteria: Checkbox**).
   - The imported `TRUE`/`FALSE` text values will render correctly as checked/
     unchecked boxes once this formatting is applied.

You should now have a sheet with one tab named `items`, a header row, and 5
sample rows (one of them, "Cozy Throw Blanket," is pre-marked as claimed so
you can see the "Already Claimed" section working immediately).

**Keep this spreadsheet private** — you never need to share it with anyone.
Only the Apps Script web app (set up next) is made public, and it only ever
exposes the specific fields the site needs.

---

## Part 2 — Create the Apps Script project

1. With the spreadsheet open, go to **Extensions → Apps Script**. A new tab
   opens with a script editor already connected to your sheet.
2. Delete the placeholder code in the editor (the `function myFunction() {}`
   stub) and select all / delete it.
3. Open `apps-script/Code.gs` from this repo, copy its entire contents, and
   paste them into the Apps Script editor.
4. Click the project name at the top-left (something like "Untitled
   project") and rename it to, e.g., "Registry API."
5. Click the save icon (💾) or press **Ctrl/Cmd+S**.

---

## Part 3 — Deploy as a web app

1. In the Apps Script editor, click the blue **Deploy** button (top-right) →
   **New deployment**.
2. Click the gear icon ⚙️ next to "Select type" and choose **Web app**.
3. Fill in the deployment form:
   - **Description**: `Registry API v1` (anything you like — it's just a
     label for you).
   - **Execute as**: **Me** (your Google account).
   - **Who has access**: **Anyone**.
4. Click **Deploy**.
5. A permissions popup appears since this is your own script accessing your
   own sheet:
   - Choose your Google account.
   - You'll likely see a warning screen saying "Google hasn't verified this
     app." This is normal and expected for personal scripts you wrote
     yourself — click **Advanced**, then **Go to Registry API (unsafe)**,
     then **Allow**.
6. After deploying, a dialog shows a **Web app URL** ending in `/exec`. Click
   **Copy**, and paste it somewhere temporarily (a notes app, or right into
   `script.js` in the next step). It looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`

---

## Part 4 — Connect the frontend

1. Open `script.js` in this repo.
2. Near the top, find:
   ```js
   var CONFIG = {
     API_URL: "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE",
   };
   ```
3. Replace `PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE` with the URL you copied
   in Part 3 (keep the quotes), so it looks like:
   ```js
   var CONFIG = {
     API_URL: "https://script.google.com/macros/s/AKfycb.../exec",
   };
   ```
4. Save the file.

You can now test locally before deploying: open a terminal in this folder and
run `python3 -m http.server`, then visit `http://localhost:8000` in your
browser. You should see the registry load your 5 sample items.

---

## Part 5 — Deploy to GitHub Pages

1. Push `index.html`, `style.css`, `script.js`, and this repo's other files
   to the root of a GitHub repository (on the `main` branch).
2. On GitHub, go to your repo's **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Under **Branch**, choose `main` and folder `/(root)`, then click **Save**.
5. Wait about a minute, then refresh the Pages settings page — it will show
   your live URL, something like `https://your-username.github.io/your-repo/`.

**Why relative paths matter here:** `index.html` links to `./style.css` and
`./script.js` (relative paths), not `/style.css`. GitHub Pages project sites
are served from a *subpath* like `/your-repo/`, not the domain root. If the
HTML used absolute paths (`/style.css`), the browser would look for the file
at `your-username.github.io/style.css` — outside the `/your-repo/` folder —
and get a 404. Because every asset reference in this project is relative, the
site works correctly regardless of whether it ends up at a domain root or a
project subpath, with no changes needed.

---

## Redeploying after you edit `Code.gs` (important!)

Editing the script in the Apps Script editor does **not** automatically
update the live web app — the `/exec` URL keeps serving whatever code was
live at the last deployment until you publish a new version.

To push a code change live:

1. In the Apps Script editor, click **Deploy → Manage deployments**.
2. Click the pencil (✏️) icon next to your existing deployment.
3. Under **Version**, choose **New version**.
4. Click **Deploy**.

**Do not** click "New deployment" for updates — that mints a brand-new URL,
which would break the one already saved in `script.js` and require you to
update and re-push the frontend. Always use **Manage deployments → Edit →
New version** for changes after the first setup.

---

## Adding, editing, and removing items later

No code, no admin page — just edit the `items` tab directly:

- **Add an item**: insert a new row. In the `id` cell, type a formula like:
  ```
  ="item-"&ROW()
  ```
  This generates a unique id automatically based on the row number (e.g. a
  new row 7 becomes `item-7`) so you never have to invent ids by hand. Fill
  in `name`, `link`, `price`, `category`, and optionally `image_url` and
  `note`. Leave `claimed` unchecked (FALSE), and leave `claimed_by` and
  `claim_code` blank.
- **Edit an item**: just change the cell values (name, price, link, note,
  etc.). Visitors will see the update next time they load or refresh the
  page.
- **Remove an item**: right-click the row number and choose **Delete row**.
  If it was claimed, its claim code is deleted with it — that's fine, since
  nothing else references it once the item is gone.
- **Categories** aren't a fixed list — the site automatically builds its
  category filter from whatever text you type into the `category` column, so
  you can introduce new categories anytime just by typing them.
- You can freely reorder rows. If you're using the `="item-"&ROW()` formula,
  only rows where that formula is present will renumber themselves if you
  insert/delete rows above them — existing plain-text ids on other rows won't
  change, which is fine since ids just need to stay unique, not sequential.

The header welcome message and move-in date at the top of the page are plain
text in `index.html` (inside `<header class="site-header">`), not connected
to the spreadsheet — edit them directly in that file whenever you like.

---

## Troubleshooting

- **"The registry isn't connected yet" message on the site** — `API_URL` in
  `script.js` still has the placeholder text; revisit Part 4.
- **Items never finish loading / spinner never stops** — check that the
  deployment's access is set to **Anyone** (Part 3), and that the URL in
  `script.js` ends in `/exec`, not `/dev`.
- **A claim seems to succeed but disappears after a refresh** — you likely
  edited `Code.gs` after the first deploy but forgot the "new version" step
  above; the live URL is still running old code.
- **Errors in the browser console that look CORS-related** — make sure any
  custom `fetch` calls you add still send POST requests with
  `Content-Type: text/plain`, not `application/json`. Apps Script web apps
  don't handle the OPTIONS preflight request that a JSON content type would
  trigger, so switching this would break claim/unclaim.
