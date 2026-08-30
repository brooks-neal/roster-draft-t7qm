# Family & Friends Org Chart

A private, live org chart. Departments are families; every person shows their name,
role, birthdate, and an age that ticks up every quarter-second
(`34y 103d 14h 22m 09s`).

The site is hosted on public GitHub Pages, but the people data is **encrypted**
(AES-256-GCM, PBKDF2-SHA256, 250k iterations). Without the passphrase the page is
a lock screen and the payload is noise. Decryption happens entirely in the browser.

## Files

| File | Committed? | What it is |
| --- | --- | --- |
| `people.json` | **No** (gitignored) | Your real names and birthdates. Stays on your Mac. |
| `people.sample.json` | Yes | Template showing the format. |
| `build.mjs` | Yes | Encrypts `people.json` into `data.enc.js`. |
| `data.enc.js` | Yes | The encrypted payload the site loads. |
| `index.html`, `app.js`, `styles.css` | Yes | The site. |

## Editing the chart

1. Open `people.json` and edit it. One object per department:

```json
{
  "name": "Neal Family",
  "tagline": "Headquarters",
  "members": [
    { "id": "dad", "name": "Robert Neal", "role": "Chief Executive Dad", "birthdate": "1962-03-14" },
    { "id": "me",  "name": "Brooks Neal", "role": "VP of Group Chats",   "birthdate": "1994-11-23", "parent": "dad" }
  ]
}
```

- `birthdate` is `YYYY-MM-DD`, or `YYYY-MM-DD HH:MM` if you know the hour of birth.
  It is read as local time, so the counter is right down to the second.
- `parent` is optional and points at another member's `id` in the same department.
  It draws the connector line. Leave it off and the person sits at the top row.
- `role` and `tagline` are optional flavor.

2. Re-encrypt and publish:

```bash
cd "/Users/brooksneal/Documents/Claude Code Projects/family-org-chart" && node build.mjs && git add -A && git commit -m "Update the org chart" && git push
```

`build.mjs` asks for the passphrase (it is not echoed and not saved anywhere) and
validates every birthdate before encrypting, so a typo fails loudly instead of
silently becoming ciphertext.

## Changing the passphrase

Re-run `node build.mjs` with the new one and push. Everyone using the old
passphrase will need the new one; anyone with the site open should hit **Lock**.

## Previewing locally

```bash
cd "/Users/brooksneal/Documents/Claude Code Projects/family-org-chart" && python3 -m http.server 3003
```

Then open http://localhost:3003. Do not open `index.html` by double-clicking it —
browsers block the crypto API on `file://`.

## What "Remember on this device" does

Stores the passphrase in that browser's `localStorage` so the viewer skips the lock
screen next time. It never leaves their device. **Lock** in the footer clears it.

## Honest limits

- The repo is public, so anyone can download `data.enc.js`. It is well-encrypted, but
  a weak or widely-shared passphrase is the only thing standing between a stranger
  and the birthdates. Use something long, and share it in person or over a private message.
- `robots.txt` and the `noindex` tag keep the page out of search results. They are a
  request, not a lock — the passphrase is the real protection.
