# suckafree.org

Website for Sucka Free Collective, an SF born & raised artist collective and warehouse in the Bayview.

| Path | What it is |
| --- | --- |
| `public/` | The site: `index.html` and the `img/` folder. Pages are views inside `index.html`, switched by the URL hash, e.g. `suckafree.org/#events`. |
| `src/worker.js` | The small backend: email sign-ups (`POST /api/signup`) and the password-protected sign-up list (`/admin`). |
| `google-sheet/Code.gs` | Apps Script that copies each new sign-up into the collective's Google Sheet. |
| `wrangler.jsonc` | Cloudflare settings. |

Cloudflare is connected to this repository: every push to `main` goes live in about a minute.

## Email sign-ups

The footer form (name, email, skills, membership interest) and the lavender banner (email only) both post to `/api/signup`. Each sign-up is saved in a Cloudflare D1 database (`suckafree-signups`, created automatically on deploy). Duplicates are ignored, and a hidden field catches simple bots.

- **See the list:** `https://suckafree.org/admin`. Any username, with the `ADMIN_PASSWORD` password. You can download a CSV, remove someone, or resend rows that didn't reach the sheet.
- **Google Sheet copy:** new sign-ups are added to a **Website Sign-ups** tab in the collective's Warehouse Project spreadsheet, using the People tab's column names (Name, Email, Status, Skills). Status is *Interested* if they ticked membership, otherwise *Lead*.

### Secrets

Set in Cloudflare: Workers & Pages > suckafree-site > Settings > Variables and Secrets. Use type **Secret** for all three.

| Name | Value |
| --- | --- |
| `ADMIN_PASSWORD` | Password for `/admin`. |
| `SHEET_SECRET` | Any long random string. Must match `SECRET` in `Code.gs`. |
| `SHEET_WEBHOOK_URL` | The Apps Script **Web app** URL. |

### Google Sheet setup

1. Open the spreadsheet > Extensions > Apps Script. Replace the contents of `Code.gs` with `google-sheet/Code.gs` from this repository.
2. Set `SECRET` at the top to the same value as `SHEET_SECRET`.
3. Deploy > New deployment > type **Web app**. Execute as **Me**, who has access **Anyone**. Deploy and allow access.
4. Copy the Web app URL into the `SHEET_WEBHOOK_URL` secret in Cloudflare.

Sign-ups made before the sheet was connected can be sent with **Send missing to the sheet** on `/admin`.

## Not connected yet

The membership, rental and contact forms still show a preview message instead of sending.
