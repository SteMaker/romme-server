'use strict';

const { Card } = require('../deck');
const { RommeGame, PHASES } = require('../rommeGame');

const c = (rank, suit, idx = 0) => new Card(suit, rank, idx);
const joker = (idx = 0) => new Card('joker', 'joker', idx);
const ranks = (meld) => meld.cards.map((card) => (card.isJoker ? 'joker' : card.rank));

// Sets up a game in PLAY phase with a controlled hand for p1.
// extraCards are added so the player always has at least one card left after melding.
function makeGame(handCards, { playerId = 'p1' } = {}) {
  const game = new RommeGame([playerId, 'p2']);
  game.start();
  game.phase = PHASES.PLAY;
  const player = game.players.get(playerId);
  player.hand = handCards;
  return { game, player, playerId };
}

// ---------------------------------------------------------------------------
// layDownMeld – 40-point initial meld rule
// ---------------------------------------------------------------------------

describe('layDownMeld – initial meld (Erstauslage)', () => {
  test('3× dame (30 pts) is rejected', () => {
    const meldCards = [c('dame', 'herz'), c('dame', 'karo'), c('dame', 'pik')];
    const { game, playerId } = makeGame([...meldCards, c('2', 'herz')]);
    const result = game.layDownMeld(playerId, meldCards.map((x) => x.id));
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatch(/40/);
  });

  test('3× ass satz (33 pts) is rejected', () => {
    const meldCards = [c('ass', 'herz'), c('ass', 'karo'), c('ass', 'pik')];
    const { game, playerId } = makeGame([...meldCards, c('2', 'herz')]);
    const result = game.layDownMeld(playerId, meldCards.map((x) => x.id));
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatch(/40/);
  });

  test('4× dame (40 pts) is accepted', () => {
    const meldCards = [
      c('dame', 'herz'), c('dame', 'karo'), c('dame', 'pik'), c('dame', 'kreuz'),
    ];
    const { game, playerId } = makeGame([...meldCards, c('2', 'herz')]);
    const result = game.layDownMeld(playerId, meldCards.map((x) => x.id));
    expect(result).toMatchObject({ ok: true, type: 'satz' });
  });

  test('folge 10-bube-dame-koenig of herz (40 pts) is accepted', () => {
    const meldCards = [
      c('10', 'herz'), c('bube', 'herz'), c('dame', 'herz'), c('koenig', 'herz'),
    ];
    const { game, playerId } = makeGame([...meldCards, c('2', 'pik')]);
    const result = game.layDownMeld(playerId, meldCards.map((x) => x.id));
    expect(result).toMatchObject({ ok: true, type: 'folge' });
  });

  test('cards are returned to hand on rejection', () => {
    const meldCards = [c('dame', 'herz'), c('dame', 'karo'), c('dame', 'pik')];
    const extra = c('2', 'herz');
    const { game, player, playerId } = makeGame([...meldCards, extra]);
    game.layDownMeld(playerId, meldCards.map((x) => x.id));
    expect(player.hand).toHaveLength(4); // all cards back
  });
});

// ---------------------------------------------------------------------------
// layDownMeld – second meld (hasInitialMeld already true)
// ---------------------------------------------------------------------------

describe('layDownMeld – second and subsequent melds', () => {
  test('< 40 pts allowed after initial meld already done', () => {
    const meldCards = [c('dame', 'herz'), c('dame', 'karo'), c('dame', 'pik')];
    const { game, player, playerId } = makeGame([...meldCards, c('2', 'herz')]);
    player.hasInitialMeld = true;
    const result = game.layDownMeld(playerId, meldCards.map((x) => x.id));
    expect(result).toMatchObject({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// layDownMeld – structural validation (independent of 40-pt rule)
// ---------------------------------------------------------------------------

describe('layDownMeld – meld structure validation', () => {
  test('invalid structure is rejected even with hasInitialMeld = true', () => {
    // Two random cards of different rank and suit — no valid satz or folge
    const meldCards = [c('ass', 'herz'), c('koenig', 'pik'), c('dame', 'karo')];
    const { game, player, playerId } = makeGame([...meldCards, c('2', 'herz')]);
    player.hasInitialMeld = true;
    const result = game.layDownMeld(playerId, meldCards.map((x) => x.id));
    expect(result).toMatchObject({ ok: false });
  });

  test('card not in hand is rejected', () => {
    const handCards = [c('dame', 'herz'), c('2', 'herz')];
    const { game, playerId } = makeGame(handCards);
    const ghost = c('ass', 'karo'); // not in hand
    const result = game.layDownMeld(playerId, [ghost.id]);
    expect(result).toMatchObject({ ok: false });
  });

  test('melding all cards (no card left to discard) is rejected', () => {
    // Only 3 cards in hand — all would be melded, leaving nothing to discard
    const meldCards = [c('dame', 'herz'), c('dame', 'karo'), c('dame', 'pik')];
    const { game, player, playerId } = makeGame(meldCards);
    player.hasInitialMeld = true;
    const result = game.layDownMeld(playerId, meldCards.map((x) => x.id));
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatch(/mindestens eine Karte/);
  });

  test('wrong player is rejected', () => {
    const meldCards = [c('dame', 'herz'), c('dame', 'karo'), c('dame', 'pik')];
    const { game } = makeGame([...meldCards, c('2', 'herz')]);
    const result = game.layDownMeld('p2', meldCards.map((x) => x.id));
    expect(result).toMatchObject({ ok: false });
  });
});

// ---------------------------------------------------------------------------
// appendToMeld – joker scenarios
// ---------------------------------------------------------------------------

function makeGameWithMeld(meldCards, meldType, handCards) {
  const { game, player, playerId } = makeGame(handCards);
  player.hasInitialMeld = true;
  game.tableMelds.push({ id: 0, cards: meldCards, type: meldType, ownerId: playerId });
  return { game, player, playerId, meldId: 0 };
}

describe('appendToMeld – joker scenarios', () => {
  test('[7, J, 9] herz + 10-herz right: joker stays internal, meld grows', () => {
    const meld = [c('7', 'herz'), joker(), c('9', 'herz')];
    const handCard = c('10', 'herz');
    const { game, player, meldId, playerId } = makeGameWithMeld(meld, 'folge', [handCard, c('2', 'pik')]);
    const result = game.appendToMeld(playerId, handCard.id, meldId, 'right');
    expect(result).toMatchObject({ ok: true });
    expect(ranks(game.tableMelds[meldId])).toEqual(['7', 'joker', '9', '10']);
    expect(player.hand.some((c) => c.isJoker)).toBe(false);
  });

  test('[7, J, 9] herz + 6-herz left: joker stays internal, meld grows', () => {
    const meld = [c('7', 'herz'), joker(), c('9', 'herz')];
    const handCard = c('6', 'herz');
    const { game, player, meldId, playerId } = makeGameWithMeld(meld, 'folge', [handCard, c('2', 'pik')]);
    const result = game.appendToMeld(playerId, handCard.id, meldId, 'left');
    expect(result).toMatchObject({ ok: true });
    expect(ranks(game.tableMelds[meldId])).toEqual(['6', '7', 'joker', '9']);
    expect(player.hand.some((c) => c.isJoker)).toBe(false);
  });

  test('[J, 8, 9] herz + 7-herz left: rejected (7 is the joker\'s position; use replaceJoker)', () => {
    const meld = [joker(), c('8', 'herz'), c('9', 'herz')];
    const handCard = c('7', 'herz');
    const { game, player, meldId, playerId } = makeGameWithMeld(meld, 'folge', [handCard, c('2', 'pik')]);
    const result = game.appendToMeld(playerId, handCard.id, meldId, 'left');
    expect(result).toMatchObject({ ok: false });
    expect(ranks(game.tableMelds[meldId])).toEqual(['joker', '8', '9']);
    expect(player.hand.some((c) => c.isJoker)).toBe(false);
  });

  test('[7, J, 9] herz + 8-herz right: rejected (8 is the joker\'s position; use replaceJoker)', () => {
    const meld = [c('7', 'herz'), joker(), c('9', 'herz')];
    const handCard = c('8', 'herz');
    const { game, player, meldId, playerId } = makeGameWithMeld(meld, 'folge', [handCard, c('2', 'pik')]);
    const result = game.appendToMeld(playerId, handCard.id, meldId, 'right');
    expect(result).toMatchObject({ ok: false });
    expect(ranks(game.tableMelds[meldId])).toEqual(['7', 'joker', '9']);
    expect(player.hand.some((c) => c.isJoker)).toBe(false);
  });

  test('[7, 8, 9] herz + joker right: joker becomes right boundary', () => {
    const meld = [c('7', 'herz'), c('8', 'herz'), c('9', 'herz')];
    const handCard = joker();
    const { game, player, meldId, playerId } = makeGameWithMeld(meld, 'folge', [handCard, c('2', 'pik')]);
    const result = game.appendToMeld(playerId, handCard.id, meldId, 'right');
    expect(result).toMatchObject({ ok: true });
    expect(ranks(game.tableMelds[meldId])).toEqual(['7', '8', '9', 'joker']);
    expect(player.hand.some((c) => c.isJoker)).toBe(false);
  });

  test('[7, J, 9] herz + bube-herz right: rejected, meld unchanged', () => {
    const meld = [c('7', 'herz'), joker(), c('9', 'herz')];
    const handCard = c('bube', 'herz');
    const { game, meldId, playerId } = makeGameWithMeld(meld, 'folge', [handCard, c('2', 'pik')]);
    const result = game.appendToMeld(playerId, handCard.id, meldId, 'right');
    expect(result).toMatchObject({ ok: false });
    expect(ranks(game.tableMelds[meldId])).toEqual(['7', 'joker', '9']);
  });

  test('[10, B, D, K] herz + A right: should stay 10-B-D-K-A, not wrap-sorted', () => {
    const meld = [c('10', 'herz'), c('bube', 'herz'), c('dame', 'herz'), c('koenig', 'herz')];
    const handCard = c('ass', 'herz');
    const { game, meldId, playerId } = makeGameWithMeld(meld, 'folge', [handCard, c('2', 'pik')]);
    const result = game.appendToMeld(playerId, handCard.id, meldId, 'right');
    expect(result).toMatchObject({ ok: true });
    expect(ranks(game.tableMelds[meldId])).toEqual(['10', 'bube', 'dame', 'koenig', 'ass']);
  });

  test('[7, J, 9] herz + 10-pik right: wrong suit rejected, meld unchanged', () => {
    const meld = [c('7', 'herz'), joker(), c('9', 'herz')];
    const handCard = c('10', 'pik');
    const { game, meldId, playerId } = makeGameWithMeld(meld, 'folge', [handCard, c('2', 'pik')]);
    const result = game.appendToMeld(playerId, handCard.id, meldId, 'right');
    expect(result).toMatchObject({ ok: false });
    expect(ranks(game.tableMelds[meldId])).toEqual(['7', 'joker', '9']);
  });
});
