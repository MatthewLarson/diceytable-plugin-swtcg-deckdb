# SWTCG Deck Database plugin

A worked plugin for the community-run [Star Wars TCG Deck Database](https://swtcg-deckdb.com).
It reads **public decklists** and nothing else.

It exists alongside `../scryfall-mtg/` because the two providers are shaped very differently, and
building only against Scryfall hid a whole class of gaps. Scryfall offers a search API,
server-side pagination, small per-page responses, and pre-composed absolute image URLs. This
provider has **none of those**. The full account is
`docs/feature-plans/tcg-wargame-support/P4-field-report-swtcg.md`.

## What it does

| Function | Endpoint | Returns |
|---|---|---|
| `deckById` | `GET /api/decks/{deckId}` | One public deck: `cards` and `supply`, each `{count, name, setCode}` |
| `starterDecks` | `GET /api/starters` | The 13 official starter decks, with full lists |
| `publicDecks` | `GET /api/decks` | Summaries of every public deck. No card lists |

`capabilities.allowed` is `["network"]` only — no table half, no table state, no script.

## What it deliberately does NOT do

**It supplies no card data and no card art.** There is no `cardMapping` and no `ui` block, because
this provider cannot feed the plugin card-source path at all:

- It has **no card-search endpoint**. Its own frontend downloads the entire dataset once and
  filters client-side, which the fetch model has no way to express.
- That dataset is **5.75 MiB**, against a 2 MiB `PLUGIN_FETCH_MAX_RESPONSE_BYTES`.
- Its records carry `set` and `imageFrag` **separately**, never an absolute URL, and the mapping
  grammar has no way to compose one.

A mod using this plugin therefore ships its own card catalogue and resolves names against it. The
`star-wars-tcg` mod does exactly that — see its `tools/build-catalogue.mjs`.

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

`deckId` is the 6-character token from a `swtcg-deckdb.com/deck/<id>` permalink.

## Two contract features this plugin is the reason for

Both were added because this manifest could not be written without them:

- **`nullable`** — 4 of the 20 fields on a decklist response carry `null` (`description` on every
  deck sampled; `format`, `pool` and `played_by_user_id` intermittently). `optional` means *absent*,
  not *null*, so before `nullable` existed this endpoint had no spelling.
- **Return schemas strip rather than reject** — the live payload carries 10 keys this manifest does
  not declare, including `is_mine` and `updated_at`, which appear in no sample an author would work
  from. Under the old strict compile every call failed. Stripping keeps the guarantee that a mod
  sees only declared fields while surviving ordinary provider evolution.

## Provider notes

Volunteer-run fan project with no documented API, no `robots.txt`, and no published rate limits.
The declared limits here (20/min, 5,000/day) are deliberately conservative and are a ceiling the
author accepts, not a budget the platform grants. Cache aggressively; do not poll.

Card data and images are derived from the [LackeyCCG SWTCG plugin](https://github.com/SWTCG/SWTCG-LACKEY).
Unofficial fan content under the Wizards of the Coast Fan Content Policy; not affiliated with or
endorsed by Wizards of the Coast, Lucasfilm or Disney.
