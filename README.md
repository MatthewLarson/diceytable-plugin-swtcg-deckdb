# SWTCG Deck Database plugin

A worked plugin for the community-run [Star Wars TCG Deck Database](https://swtcg-deckdb.com).
It reads **card data and public decklists**, and nothing else.

It exists alongside `../scryfall-mtg/` because the two providers are shaped very differently, and
building only against Scryfall hid a whole class of gaps. Scryfall offers a search API,
server-side pagination, small per-page responses, and pre-composed absolute image URLs. This
provider has **none of those**. The full account is
`docs/feature-plans/tcg-wargame-support/P4-field-report-swtcg.md`.

## What it does

| Function | Endpoint | Returns |
|---|---|---|
| *(platform)* | `GET /static/cards.json` | The whole card database, ingested on a schedule. Not callable by a mod |
| `deckById` | `GET /api/decks/{deckId}` | One public deck: `cards` and `supply`, each `{count, name, setCode}` |
| `starterDecks` | `GET /api/starters` | The 13 official starter decks, with full lists |
| `publicDecks` | `GET /api/decks` | Summaries of every public deck. No card lists |
| `userDecks` | `GET /api/users/{userId}/decks` | One user's public decks |
| `cardDecks` | `GET /api/card-decks?name&set` | Public decks that play a given card |
| `cardRatings` | `GET /api/card-ratings?name&set` | Community rating summary for one card |
| `tournaments` | `GET /api/tournaments` | Every tournament, ongoing and archived |
| `tournamentById` | `GET /api/tournaments/{tournamentId}` | One tournament, its entrants and their deck ids |
| `providerStatus` | `GET /api/config` | Liveness probe |

`capabilities.allowed` is `["network"]` only — no table half, no table state, no script.

The provider's routes are documented at `https://swtcg-deckdb.com` (see the maintainer's public API
notes). `GET /api/card-ratings/bulk` is declared as an endpoint but is not exposed to mods: its
response is one object keyed `"{name}|{set}"`, which the return-schema grammar describes as a bag of
unknown keys and therefore cannot bound. Ask for it if a mod needs it.

## Card data: a scheduled catalogue, not a search

**This provider has no card-search endpoint.** Its own frontend downloads the entire dataset once
and filters client-side, which the per-request fetch model has no way to express. So the card half
is declared as a `returns: "catalogue"` endpoint: the platform reads `/static/cards.json` on a
schedule, normalizes it once through the ordinary `cardMapping`, and the deck builder searches the
result locally. One upstream request per refresh interval, shared by every player.

- **10,891 cards, 6,028,156 bytes** (measured 2026-08-27). That is three times
  `PLUGIN_FETCH_MAX_RESPONSE_BYTES` — which is why this could not be a card endpoint — and well
  inside `PLUGIN_CATALOGUE_FETCH_MAX_RESPONSE_BYTES` (16 MiB), which is the ceiling a scheduled
  read is held to.
- **Identity is `imageFrag`**, not the card number: `set` + `number` collides (9,355 distinct pairs
  across 10,891 cards) while `imageFrag` is distinct for every record.
- **Numeric fields arrive as strings** and are not always numbers — `cost` can be `"X"`, `speed`
  and `power` can be `"*"`, and non-unit types carry `""`. The `number` transform yields *no value*
  for all three rather than inventing a `0`, so the cost curve is built from cards that have a cost.

### Art is composed, because the provider never returns a URL

Records carry `set` and `imageFrag` separately; the image itself lives in the
[LackeyCCG SWTCG plugin](https://github.com/SWTCG/SWTCG-LACKEY) repo. `cardMapping.artUrl` composes
the two against a **declared** origin:

```
raw.githubusercontent.com + /SWTCG/SWTCG-LACKEY/refs/heads/release/official/starwars/sets/setimages/{set}/{frag}.jpg
```

Both placeholders name **mapped field keys**, never raw upstream paths, and values are
percent-encoded per segment — so the complete set of values that can reach the URL is readable from
the field list, and `raw.githubusercontent.com` being in `origins` is a reviewable act rather than a
string the provider happened to put in a field.

## Deck import

`deckImport` reuses `deckById` unchanged and joins on `name`. That works because **every one of the
10,891 records has a distinct name**, so the join cannot land on two cards. A decklist entry's
`setCode` is deliberately *not* wired to `setField`: a second key that never disambiguates anything
would only start dropping rows when the provider's set codes drift from a saved deck's.

`matchField` names a field of whatever catalogue the deck builder has loaded, so the same import
block worked before this plugin supplied cards (against a mod's own catalogue) and works now
against this one.

## Calling it from a mod

Declare the use in the mod manifest, add the `plugin-call` capability, and write both targets as
**inline string literals** — a `var` holding the plugin id reads as a computed target and fails
publish with `dynamic-plugin-call`:

```js
var result = await api.callPlugin("community.swtcg-deckdb", "deckById", { deckId: "nmPcAc" });
if (result.ok) {
  api.log(result.data.name + ": " + result.data.cards.length + " lines");
}
```

`deckId` is the 6-character token from a `swtcg-deckdb.com/deck/<id>` permalink. The catalogue
endpoint is **not** callable this way — it has no exposed function, because it is fetched by a
scheduler with nobody waiting.

## Contract features this plugin is the reason for

Each was added because this manifest could not be written without it:

- **`nullable`** — 4 of the 20 fields on a decklist response carry `null` (`description` on every
  deck sampled; `format`, `pool` and `played_by_user_id` intermittently). `optional` means *absent*,
  not *null*, so before `nullable` existed this endpoint had no spelling.
- **Return schemas strip rather than reject** — the live payload carries 10 keys this manifest does
  not declare, including `is_mine` and `updated_at`, which appear in no sample an author would work
  from. Under the old strict compile every call failed. Stripping keeps the guarantee that a mod
  sees only declared fields while surviving ordinary provider evolution.
- **`cardMapping.artUrl`** — the `{set}` + `{imageFrag}` case above (F3), which also closed F4b: an
  art URL used to be whatever string a provider put in a field, handed to a viewer's `<img src>`
  outside the declared-origin allowlist.
- **`returns: "catalogue"`** — a provider that publishes a whole dataset and offers no search (F1).

Return-schema **nesting depth is capped at 5**, which is why `tournamentById` exposes each entrant's
`deck_ids` rather than nested deck objects; a mod resolves them with `deckById`.

## Resources: one card back

The manifest declares two `resources` so the plugin-resource contract (AB-1) is exercised by a real
plugin, not only by test fixtures:

| Path | Kind | What it is |
|---|---|---|
| `textures/card-back.png` | `texture` | A 250×350 procedural card back (≈3 KB), also the thumbnail for both entries |
| `materials/card-back.json` | `material` | A matte material whose `diffuseMap` is the texture above |

The material exists to prove the closed set: its only texture reference is the exact `path` of a
texture this manifest declares, which is the only kind of reference the scanner accepts.

**The image is own work, and contains no card art.** It is generated by
`scripts/generate-card-back.mjs` from arithmetic alone, using only Node built-ins, and re-running the
script reproduces the committed bytes exactly. It is not Star Wars, Decipher or Wizards of the
Coast artwork, and it is not derived from any card scan. Card art for the catalogue still comes
from the LackeyCCG repo through `cardMapping.artUrl`, as described above.

Declaring a resource publishes nothing else from this repo. The CDN serves exactly the declared
paths at the registered commit sha, and only after the scanner has fetched and checked them. The
generator script, this README and every other file stay unserved.

## Provider notes

Volunteer-run fan project with no `robots.txt` and no published rate limits. The declared limits
here (20/min, 5,000/day) are deliberately conservative and are a ceiling the author accepts, not a
budget the platform grants. Cache aggressively; do not poll. The catalogue is read on the
platform's schedule and is not affected by these limits per player.

Card data and images are derived from the [LackeyCCG SWTCG plugin](https://github.com/SWTCG/SWTCG-LACKEY).
Unofficial fan content under the Wizards of the Coast Fan Content Policy; not affiliated with or
endorsed by Wizards of the Coast, Lucasfilm or Disney.
