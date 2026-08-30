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
| `edit.mjs` + `tools/` | Yes | The local editor UI (`node edit.mjs`). |
| `build.mjs` | Yes | Command-line version of the same encrypt step. |
| `lib/encrypt.mjs` | Yes | Validation + AES-GCM encryption, shared by both. |
| `data.enc.js` | Yes | The encrypted payload the site loads. |
| `index.html`, `app.js`, `styles.css` | Yes | The site. |

## The easy way: the editor

```bash
cd "/Users/brooksneal/Documents/Claude Code Projects/family-org-chart" && node edit.mjs
```

Then open **http://localhost:4173**. You get a form for every person &mdash; name, role,
birthdate picker, and a "Reports to" dropdown that draws the connector lines. Add and
remove people, reorder them, add whole families, and watch each person's age appear as
you type the date.

- **Save** writes `people.json` (Cmd-S works too). Nothing leaves your Mac.
- **Preview chart** opens the real chart at http://localhost:4173/chart.
- **Publish** asks for the passphrase once, then encrypts, commits, and pushes.
  GitHub Pages picks it up within about a minute. Tick "Encrypt only" to rebuild
  `data.enc.js` without pushing.

The server binds to `127.0.0.1`, so it is only reachable from this Mac, and it refuses
to serve `people.json` over HTTP. Press Ctrl+C in the terminal when you are done.

## The manual way: editing the JSON

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

- `birthdate` is **optional** — leave it out and the person still appears on the chart,
  with "Birthdate to come" where the age counter goes. Fill it in whenever you find it.
  Format is `YYYY-MM-DD`, or `YYYY-MM-DD HH:MM` if you know the hour of birth. It is
  read as local time, so the counter is right down to the second. The headcount tells
  you how many people are still missing a date.
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

There is nothing to "change" — the passphrase is never stored anywhere. Every publish
re-encrypts `people.json` from scratch with whatever passphrase you type, so **hit
Publish and enter the new one**. That is the whole procedure.

What happens to everyone else:

- Anyone who ticked "Remember on this device" is silently returned to the lock screen
  on their next visit, and their saved passphrase is deleted. They just need the new one.
- Anyone with the page already open keeps seeing it until they reload.

**What a passphrase change does not do:** old commits in the public repo still contain
the old `data.enc.js`. Someone who had the previous passphrase, and who kept or can
fetch an old commit, can still decrypt that older snapshot of the chart. Changing the
passphrase protects everything from now on, not what was already published.

If you need a genuine reset — say a passphrase leaked and you want the old data gone
from GitHub entirely — the history has to go too:

```bash
cd "/Users/brooksneal/Documents/Claude Code Projects/family-org-chart" && node build.mjs && git checkout --orphan fresh && git add -A && git commit -m "Org chart" && git branch -D main && git branch -m main && git push -f origin main
```

That replaces the repo's entire history with a single commit holding only the newly
encrypted data. It cannot be undone, and anyone who already cloned the repo keeps
their copy.

## Previewing locally

`node edit.mjs` already serves the chart at http://localhost:4173/chart. Do not open
`index.html` by double-clicking it — browsers block the crypto API on `file://`.

## What "Remember on this device" does

Stores the passphrase in that browser's `localStorage` so the viewer skips the lock
screen next time. It never leaves their device. **Lock** in the footer clears it.

## Honest limits

- The repo is public, so anyone can download `data.enc.js`. It is well-encrypted, but
  a weak or widely-shared passphrase is the only thing standing between a stranger
  and the birthdates. Use something long, and share it in person or over a private message.
- `robots.txt` and the `noindex` tag keep the page out of search results. They are a
  request, not a lock — the passphrase is the real protection.
