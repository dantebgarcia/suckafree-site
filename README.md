# suckafree.org

Website for Sucka Free Collective, an SF born & raised artist collective and warehouse in the Bayview.

- `public/` holds the site: `index.html` and the `img/` folder.
- `wrangler.jsonc` tells Cloudflare to serve `public/` as a static site.
- Cloudflare is connected to this repository, so every change pushed to `main` goes live in about a minute.

Pages are views inside `index.html` (Mission, The Space, Events, Membership, Support, Rent the Space, Contact), switched by the URL hash, for example `suckafree.org/#events`.

Forms are not connected yet; they show a preview message instead of sending.
