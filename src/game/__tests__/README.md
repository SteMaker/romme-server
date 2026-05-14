# Server Game Validation Tests

Run with:
```bash
cd server
npm test
```

---

## meldValidator.test.js

Tests the pure validation functions in `meldValidator.js`. No game state needed.

### Helper

```js
c(rank, suit)  // creates a Card, e.g. c('dame', 'herz')
joker()        // creates a Joker card
```

### validateMeld

| Test | Cards | Expected |
|------|-------|----------|
| Valid satz | ass-herz, ass-karo, ass-pik | `{ valid: true, type: 'satz' }` |
| Valid satz (4 cards) | dame all suits | `{ valid: true, type: 'satz' }` |
| Valid satz with joker | koenig-herz, koenig-pik, joker | `{ valid: true, type: 'satz' }` |
| Valid folge | 7-8-9 of herz | `{ valid: true, type: 'folge' }` |
| Valid folge with joker | 7-herz, joker, 9-herz | `{ valid: true, type: 'folge' }` |
| Valid folge with leading joker | joker, koenig-herz, ass-herz | `{ valid: true, type: 'folge' }` |
| Valid folge with boundary jokers | joker, 3-4-5-6-7-herz, joker | `{ valid: true, type: 'folge' }` |
| Invalid: too few cards | ass-herz, ass-karo | `{ valid: false }` |
| Invalid: same suit, gaps too large | ass-herz, dame-herz, 9-herz | `{ valid: false }` |
| Invalid: non-consecutive, no joker | 7-herz, 9-herz, bube-herz | `{ valid: false }` |
| Invalid: empty array | `[]` | `{ valid: false }` |

### meldValue

| Test | Cards | Expected value |
|------|-------|---------------|
| 3× dame | dame-herz/karo/pik | 30 |
| 3× ass (satz, ace=11) | ass-herz/karo/pik | 33 |
| ass-2-3 of herz (ace=1 low) | ass-herz, 2-herz, 3-herz | 6 |
| 7-8-9 of herz | — | 24 |
| satz of 10s with joker | 10-herz, 10-karo, joker | 30 |
| 4× dame | dame all suits | 40 |
| 10-bube-dame-koenig of herz | — | 40 |

### canAppendToMeld

| Test | Existing meld | Card to append | Expected |
|------|--------------|----------------|----------|
| Extend run high | 7-8-9-herz | 10-herz | `true` |
| Extend run low | 7-8-9-herz | 6-herz | `true` |
| Complete satz | ass-herz/pik/karo | ass-kreuz | `true` |
| Wrong suit | 7-8-9-herz | 10-pik | `false` |
| Gap in run | 7-8-9-herz | bube-herz (10 missing) | `false` |

**With jokers in existing meld:**

| Test | Existing meld | Card to append | Expected |
|------|--------------|----------------|----------|
| Internal joker, extend right | [7, J, 9] herz (J=8) | 10-herz | `true` |
| Internal joker, extend left | [7, J, 9] herz (J=8) | 6-herz | `true` |
| Left boundary joker, fill slot | [J, 8, 9] herz (J=7) | 7-herz | `true` |
| Left boundary joker, extend right | [J, 8, 9] herz (J=7) | 10-herz | `true` |
| Gap too large with joker | [7, J, 9] herz | bube-herz (10 missing) | `false` |
| Both boundary jokers, no room left | [J, 3-4-5-6-7, J] herz | 2-herz | `false` |
| Both boundary jokers, extend right | [J, 3-4-5-6-7, J] herz | 8-herz | `true` |

---

## rommeGame.test.js

Tests game rules via `RommeGame.layDownMeld()`. Uses direct state manipulation to bypass the draw phase.

### Helper

```js
makeGame(handCards)
// Creates a 2-player game (p1 vs p2), sets phase=PLAY,
// replaces p1's hand with the given cards.
// Always include at least one extra card beyond the meld cards
// (a card must remain to discard later).
```

### Initial meld – 40-point rule

| Test | Meld | Points | hasInitialMeld | Expected |
|------|------|--------|----------------|----------|
| Below minimum | dame-herz/karo/pik | 30 | false | `{ ok: false }`, error mentions "40" |
| Below minimum | ass-herz/karo/pik (satz) | 33 | false | `{ ok: false }`, error mentions "40" |
| Exactly 40 | dame all 4 suits | 40 | false | `{ ok: true, type: 'satz' }` |
| Exactly 40 | 10-bube-dame-koenig of herz | 40 | false | `{ ok: true, type: 'folge' }` |
| Cards returned on rejection | dame-herz/karo/pik | 30 | false | hand still has 4 cards |

### Second and subsequent melds

| Test | Meld | Points | hasInitialMeld | Expected |
|------|------|--------|----------------|----------|
| Below 40 allowed | dame-herz/karo/pik | 30 | **true** | `{ ok: true }` |

### Structural validation

| Test | Situation | Expected |
|------|-----------|----------|
| Invalid structure | ass-herz, koenig-pik, dame-karo (no valid satz/folge) | `{ ok: false }` |
| Card not in hand | card ID not present in player's hand | `{ ok: false }` |
| No card left to discard | all 3 hand cards would be melded | `{ ok: false }`, error mentions "mindestens eine Karte" |
| Wrong player | p2 tries to meld on p1's turn | `{ ok: false }` |

### appendToMeld – joker scenarios

Uses `makeGameWithMeld(meldCards, meldType, handCards)` to inject a meld directly onto the table.
`ranks(meld)` maps each card to its rank string or `'joker'` for assertions.

When the appended card fills the rank a joker was representing (internal gap or boundary), the joker is returned to the player's hand and removed from the meld.

| # | Meld on table | Hand card | Side | Meld after | Joker returned? |
|---|--------------|-----------|------|------------|-----------------|
| 1 | [7, J, 9] herz | 10-herz | right | `['7','joker','9','10']` | no |
| 2 | [7, J, 9] herz | 6-herz | left | `['6','7','joker','9']` | no |
| 3 | [J, 8, 9] herz | 7-herz | left | `['7','8','9']` | **yes** — boundary joker freed |
| 4 | [7, J, 9] herz | 8-herz | right | `['7','8','9']` | **yes** — internal joker freed |
| 5 | [7, 8, 9] herz | joker | right | `['7','8','9','joker']` | no |
| 6 | [7, J, 9] herz | bube-herz | right | `['7','joker','9']` unchanged | no (rejected) |
| 7 | [7, J, 9] herz | 10-pik | right | `['7','joker','9']` unchanged | no (rejected) |
