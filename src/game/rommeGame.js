const { Deck } = require('./deck');
const { validateMeld, meldValue } = require('./meldValidator');

/**
 * Validates that the user-supplied order of cards is a legal meld layout.
 * For a "folge" (run): normal cards must appear in strictly ascending rank order,
 * and the number of jokers between two consecutive normal cards must not exceed
 * the rank gap between them (otherwise a joker would have to represent a rank
 * outside the gap, which is impossible).
 * For a "satz" (set) any order is fine.
 */
function validateMeldOrder(orderedCards, type) {
  // Keine zwei Joker hintereinander (für alle Meldungstypen)
  for (let i = 1; i < orderedCards.length; i++) {
    if (orderedCards[i].isJoker && orderedCards[i - 1].isJoker) {
      return { valid: false, error: 'Keine zwei Joker hintereinander erlaubt' };
    }
  }

  if (type !== 'folge') return { valid: true };

  // Check whether the ordered cards form a valid ascending run using the given
  // index function. Returns { ok, jokerError } where jokerError distinguishes
  // a joker-placement error from an ascending-order error.
  function checkOrder(adjIdxFn) {
    let lastError = null;
    let prev = null;
    for (let i = 0; i < orderedCards.length; i++) {
      if (orderedCards[i].isJoker) continue;
      const curr = { adjRank: adjIdxFn(orderedCards[i]), pos: i };
      if (prev !== null) {
        if (curr.adjRank <= prev.adjRank) return { ok: false, jokerError: false };
        const rankGap = curr.adjRank - prev.adjRank - 1;
        const jokersBetween = curr.pos - prev.pos - 1;
        if (jokersBetween !== rankGap) return { ok: false, jokerError: true };
      }
      prev = curr;
    }
    return { ok: true };
  }

  // First try non-wrap (raw rank indices). This covers the vast majority of runs.
  const rawResult = checkOrder((c) => c.rankIndex);
  if (rawResult.ok) return { valid: true };

  // If that failed, try wrap remapping (Ace + low cards → low gets +13).
  // This handles legitimate wrap sequences like K-A-2.
  const normal = orderedCards.filter((c) => !c.isJoker);
  const hasWrapPotential =
    normal.some((c) => c.rank === 'ass') &&
    normal.some((c) => c.rankIndex <= 8 && c.rank !== 'ass');

  if (hasWrapPotential) {
    const wrapResult = checkOrder((c) =>
      c.rankIndex <= 8 && c.rank !== 'ass' ? c.rankIndex + 13 : c.rankIndex,
    );
    if (wrapResult.ok) return { valid: true };
  }

  return {
    valid: false,
    error: rawResult.jokerError
      ? 'Joker muss genau an der Lücke zwischen zwei Karten platziert werden'
      : 'Karten müssen in aufsteigender Reihenfolge ausgelegt werden',
  };
}

const INITIAL_HAND_SIZE = 10;
const MIN_FIRST_MELD_VALUE = 40; // Erstauslage mindestens 40 Punkte

/**
 * Phasen eines Spielzugs:
 * 1. DRAW          - Spieler muss vom Nachziehstapel ziehen (Pflicht)
 * 2. DRAW_OPTIONAL - Spieler kann optional vom Ablagestapel ziehen
 * 3. PLAY          - Spieler kann auslegen/anlegen (optional), muss dann ablegen
 */
const PHASES = { DRAW: 'draw', DRAW_OPTIONAL: 'draw_optional', PLAY: 'play' };

class PlayerState {
  constructor(playerId) {
    this.id = playerId;
    this.hand = [];
    this.melds = [];        // Eigene Auslagen
    this.hasInitialMeld = false; // Hat Erstauslage gemacht
    this.score = 0;
  }

  get handValue() {
    return this.hand.reduce((sum, card) => sum + card.value, 0);
  }

  removeCardsFromHand(cardIds) {
    const removed = [];
    for (const cardId of cardIds) {
      const index = this.hand.findIndex((c) => c.id === cardId);
      if (index === -1) return null; // Karte nicht in Hand
      removed.push(this.hand.splice(index, 1)[0]);
    }
    return removed;
  }

  addToHand(card) {
    this.hand.push(card);
  }
}

class RommeGame {
  constructor(playerIds) {
    this.playerIds = playerIds;
    this.players = new Map();
    this.deck = new Deck();
    this.currentPlayerIndex = 0;
    this.phase = PHASES.DRAW;
    this.tableMelds = [];  // Alle ausgelegten Meldungen auf dem Tisch
    this.isFinished = false;
    this.winner = null;
    this.round = 1;

    for (const id of playerIds) {
      this.players.set(id, new PlayerState(id));
    }
  }

  get currentPlayerId() {
    return this.playerIds[this.currentPlayerIndex];
  }

  get currentPlayer() {
    return this.players.get(this.currentPlayerId);
  }

  start() {
    this.deck.shuffle();

    // Karten austeilen
    for (const [, player] of this.players) {
      player.hand = this.deck.deal(INITIAL_HAND_SIZE);
    }

    // Erste Karte auf den Ablagestapel
    this.deck.discard(this.deck.draw());

    this.phase = PHASES.DRAW;
  }

  /**
   * Spieler zieht eine Karte vom Nachziehstapel (Pflicht am Zuganfang).
   */
  drawFromDeck(playerId) {
    if (playerId !== this.currentPlayerId) return { ok: false, error: 'Nicht dein Zug' };
    if (this.phase !== PHASES.DRAW) return { ok: false, error: 'Falscher Zeitpunkt zum Ziehen' };

    const card = this.deck.draw();
    if (!card) return { ok: false, error: 'Stapel ist leer' };

    this.currentPlayer.addToHand(card);
    this.phase = PHASES.DRAW_OPTIONAL;

    return { ok: true, card: card.toJSON() };
  }

  /**
   * Spieler zieht die oberste Karte vom Ablagestapel (optional, nach Nachziehstapel).
   */
  drawFromDiscard(playerId) {
    if (playerId !== this.currentPlayerId) return { ok: false, error: 'Nicht dein Zug' };
    if (this.phase !== PHASES.DRAW_OPTIONAL) {
      return { ok: false, error: 'Erst vom Nachziehstapel ziehen' };
    }

    const card = this.deck.drawFromDiscard();
    if (!card) return { ok: false, error: 'Ablagestapel ist leer' };

    this.currentPlayer.addToHand(card);
    // Stay in DRAW_OPTIONAL so the player may continue drawing from the discard pile

    return { ok: true, card: card.toJSON() };
  }

  /**
   * Spieler legt eine neue Meldung aus.
   * @param {string} playerId
   * @param {string[]} cardIds - IDs der Karten aus der Hand
   */
  layDownMeld(playerId, cardIds) {
    if (playerId !== this.currentPlayerId) return { ok: false, error: 'Nicht dein Zug' };
    if (this.phase !== PHASES.PLAY && this.phase !== PHASES.DRAW_OPTIONAL) {
      return { ok: false, error: 'Falscher Zeitpunkt zum Auslegen' };
    }

    const player = this.currentPlayer;

    // Karten aus Hand nehmen (temporär)
    const cards = player.removeCardsFromHand(cardIds);
    if (!cards) {
      return { ok: false, error: 'Karte nicht in der Hand' };
    }

    // Spieler muss immer mindestens eine Karte zum Ablegen behalten
    if (player.hand.length === 0) {
      cards.forEach((c) => player.addToHand(c));
      return { ok: false, error: 'Du musst mindestens eine Karte zum Ablegen behalten' };
    }

    // Meldung validieren
    const validation = validateMeld(cards);
    if (!validation.valid) {
      cards.forEach((c) => player.addToHand(c));
      return { ok: false, error: validation.error };
    }

    // Reihenfolge prüfen (Joker muss an der vom Spieler gewählten Position stehen)
    const orderValidation = validateMeldOrder(cards, validation.type);
    if (!orderValidation.valid) {
      cards.forEach((c) => player.addToHand(c));
      return { ok: false, error: orderValidation.error };
    }

    // Erstauslage prüfen
    if (!player.hasInitialMeld) {
      const value = meldValue(cards);
      if (value < MIN_FIRST_MELD_VALUE) {
        cards.forEach((c) => player.addToHand(c));
        return {
          ok: false,
          error: `Erstauslage muss mindestens ${MIN_FIRST_MELD_VALUE} Punkte wert sein (aktuell: ${value})`,
        };
      }
      player.hasInitialMeld = true;
    }

    if (this.phase === PHASES.DRAW_OPTIONAL) this.phase = PHASES.PLAY;

    // Meldung auf den Tisch — Reihenfolge wie vom Spieler gewählt
    const meldId = this.tableMelds.length;
    this.tableMelds.push({
      id: meldId,
      cards,
      type: validation.type,
      ownerId: playerId,
    });

    return { ok: true, meldId, type: validation.type };
  }

  /**
   * Spieler legt eine Karte an eine bestehende Meldung an.
   * @param {string} playerId
   * @param {string} cardId - ID der Karte aus der Hand
   * @param {number} meldId - ID der Meldung auf dem Tisch
   */
  appendToMeld(playerId, cardId, meldId, side = 'right') {
    if (playerId !== this.currentPlayerId) return { ok: false, error: 'Nicht dein Zug' };
    if (this.phase !== PHASES.PLAY && this.phase !== PHASES.DRAW_OPTIONAL) {
      return { ok: false, error: 'Falscher Zeitpunkt zum Anlegen' };
    }

    const player = this.currentPlayer;

    if (!player.hasInitialMeld) {
      return { ok: false, error: 'Du musst zuerst eine Erstauslage machen' };
    }

    const meld = this.tableMelds[meldId];
    if (!meld) return { ok: false, error: 'Meldung nicht gefunden' };

    const cardIndex = player.hand.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) return { ok: false, error: 'Karte nicht in der Hand' };

    const card = player.hand[cardIndex];

    // Spieler muss immer mindestens eine Karte zum Ablegen behalten
    if (player.hand.length === 1) {
      return { ok: false, error: 'Du musst mindestens eine Karte zum Ablegen behalten' };
    }

    const candidate = side === 'left' ? [card, ...meld.cards] : [...meld.cards, card];

    const structureCheck = validateMeld(candidate);
    if (!structureCheck.valid) {
      return { ok: false, error: structureCheck.error ?? 'Karte passt nicht an diese Meldung' };
    }

    const orderCheck = validateMeldOrder(candidate, meld.type);
    if (!orderCheck.valid) {
      return { ok: false, error: orderCheck.error ?? 'Ungültige Reihenfolge' };
    }

    player.hand.splice(cardIndex, 1);
    meld.cards = candidate;
    if (this.phase === PHASES.DRAW_OPTIONAL) this.phase = PHASES.PLAY;

    return { ok: true };
  }

  /**
   * Spieler tauscht einen Joker in einer Meldung gegen die passende Handkarte.
   * @param {string} playerId
   * @param {number} meldId - ID der Meldung auf dem Tisch
   * @param {string} jokerId - ID des Jokers in der Meldung
   */
  replaceJoker(playerId, meldId, jokerId) {
    if (playerId !== this.currentPlayerId) return { ok: false, error: 'Nicht dein Zug' };
    if (this.phase !== PHASES.PLAY && this.phase !== PHASES.DRAW_OPTIONAL) {
      return { ok: false, error: 'Falscher Zeitpunkt' };
    }

    const player = this.currentPlayer;
    if (!player.hasInitialMeld) {
      return { ok: false, error: 'Du musst zuerst eine Erstauslage machen' };
    }

    const meld = this.tableMelds[meldId];
    if (!meld) return { ok: false, error: 'Meldung nicht gefunden' };

    const jokerIndex = meld.cards.findIndex((c) => c.id === jokerId && c.isJoker);
    if (jokerIndex === -1) return { ok: false, error: 'Joker nicht in dieser Meldung' };

    const joker = meld.cards[jokerIndex];

    // Try each non-joker hand card at the joker slot
    for (const handCard of player.hand) {
      if (handCard.isJoker) continue;
      const testCards = [...meld.cards];
      testCards[jokerIndex] = handCard;
      const structureCheck = validateMeld(testCards);
      if (!structureCheck.valid) continue;
      const orderCheck = validateMeldOrder(testCards, meld.type);
      if (!orderCheck.valid) continue;
      // Swap: remove hand card, put joker in hand, card goes into meld
      player.hand.splice(player.hand.indexOf(handCard), 1);
      meld.cards = testCards;
      player.addToHand(joker);
      if (this.phase === PHASES.DRAW_OPTIONAL) this.phase = PHASES.PLAY;
      return { ok: true, joker: joker.toJSON(), replacedWith: handCard.toJSON() };
    }

    return { ok: false, error: 'Keine passende Karte in der Hand' };
  }

  /**
   * Spieler legt eine Karte auf den Ablagestapel ab (beendet den Zug).
   */
  discard(playerId, cardId) {
    if (playerId !== this.currentPlayerId) return { ok: false, error: 'Nicht dein Zug' };
    if (this.phase !== PHASES.PLAY && this.phase !== PHASES.DRAW_OPTIONAL) {
      return { ok: false, error: 'Falscher Zeitpunkt zum Ablegen' };
    }

    const player = this.currentPlayer;
    const cardIndex = player.hand.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) return { ok: false, error: 'Karte nicht in der Hand' };

    const card = player.hand.splice(cardIndex, 1)[0];
    this.deck.discard(card);

    // Prüfe ob Spieler gewonnen hat
    if (player.hand.length === 0) {
      this._endRound(playerId);
      return { ok: true, card: card.toJSON(), roundEnd: true };
    }

    // Nächster Spieler
    this._nextTurn();

    return { ok: true, card: card.toJSON(), roundEnd: false };
  }

  _nextTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerIds.length;
    this.phase = PHASES.DRAW;
  }

  _endRound(winnerId) {
    this.winner = winnerId;
    this.isFinished = true;

    // Punkte berechnen: Verlierer bekommen Handkarten als Minuspunkte
    for (const [id, player] of this.players) {
      if (id === winnerId) {
        player.score = 0;
      } else {
        player.score = -player.handValue;
      }
    }
  }

  /**
   * Gibt den Spielstand für einen bestimmten Spieler zurück.
   * Andere Spieler sehen nur die Anzahl der Handkarten.
   */
  getStateForPlayer(playerId) {
    const player = this.players.get(playerId);
    const otherPlayers = {};

    for (const [id, p] of this.players) {
      if (id !== playerId) {
        otherPlayers[id] = {
          id: p.id,
          handCount: p.hand.length,
          hasInitialMeld: p.hasInitialMeld,
        };
      }
    }

    return {
      hand: player.hand.map((c) => c.toJSON()),
      hasInitialMeld: player.hasInitialMeld,
      tableMelds: this.tableMelds.map((m) => ({
        id: m.id,
        cards: m.cards.map((c) => c.toJSON()),
        type: m.type,
        ownerId: m.ownerId,
      })),
      currentPlayerId: this.currentPlayerId,
      phase: this.phase,
      otherPlayers,
      discardTop: this.deck.topDiscard ? this.deck.topDiscard.toJSON() : null,
      discardPile: this.deck.discardPile.map((c) => c.toJSON()),
      deckCount: this.deck.cards.length,
      isFinished: this.isFinished,
      winner: this.winner,
      round: this.round,
    };
  }
}

module.exports = { RommeGame, PHASES };
