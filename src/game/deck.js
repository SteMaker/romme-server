/**
 * Rommé-Kartendeck: 2x 52 Karten + 6 Joker = 110 Karten
 */

const SUITS = ['herz', 'karo', 'pik', 'kreuz'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'bube', 'dame', 'koenig', 'ass'];

// Kartenwerte für Punktezählung
const CARD_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'bube': 10, 'dame': 10, 'koenig': 10,
  'ass': 11, // Ass zählt 11 (oder 1 in Folgen, wird in Spiellogik behandelt)
  'joker': 20,
};

// Rang-Index für Folgen-Prüfung (Ass ist hoch: 2..K..A)
const RANK_INDEX = {
  '2': 0, '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6,
  '9': 7, '10': 8, 'bube': 9, 'dame': 10, 'koenig': 11, 'ass': 12,
};

class Card {
  constructor(suit, rank, deckIndex = 0) {
    this.suit = suit;
    this.rank = rank;
    this.deckIndex = deckIndex; // 0 oder 1, um die zwei Decks zu unterscheiden
    this.id = `${suit}_${rank}_${deckIndex}`;
  }

  get value() {
    return CARD_VALUES[this.rank];
  }

  get rankIndex() {
    return RANK_INDEX[this.rank];
  }

  get isJoker() {
    return this.rank === 'joker';
  }

  toJSON() {
    return {
      id: this.id,
      suit: this.suit,
      rank: this.rank,
      value: this.value,
    };
  }
}

class Deck {
  constructor() {
    this.cards = [];
    this.discardPile = [];
    this._buildDeck();
  }

  _buildDeck() {
    // 2 komplette Decks
    for (let deckIdx = 0; deckIdx < 2; deckIdx++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          this.cards.push(new Card(suit, rank, deckIdx));
        }
      }
      // 3 Joker pro Deck
      for (let j = 0; j < 3; j++) {
        this.cards.push(new Card('joker', 'joker', deckIdx * 3 + j));
      }
    }
  }

  shuffle() {
    // Fisher-Yates Shuffle
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  draw() {
    if (this.cards.length === 0) {
      this._recycleDiscardPile();
    }
    return this.cards.pop();
  }

  drawFromDiscard() {
    return this.discardPile.pop() || null;
  }

  discard(card) {
    this.discardPile.push(card);
  }

  get topDiscard() {
    return this.discardPile.length > 0 ? this.discardPile[this.discardPile.length - 1] : null;
  }

  _recycleDiscardPile() {
    if (this.discardPile.length <= 1) return;
    const top = this.discardPile.pop();
    this.cards = [...this.discardPile];
    this.discardPile = top ? [top] : [];
    this.shuffle();
  }

  deal(count) {
    const hand = [];
    for (let i = 0; i < count; i++) {
      const card = this.draw();
      if (card) hand.push(card);
    }
    return hand;
  }
}

module.exports = { Deck, Card, SUITS, RANKS, CARD_VALUES, RANK_INDEX };
