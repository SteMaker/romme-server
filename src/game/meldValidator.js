/**
 * Validierung von Rommé-Auslagen (Meldungen):
 * - Satz: 3-4 Karten gleichen Rangs (verschiedene Farben)
 * - Folge (Sequenz): mind. 3 aufeinanderfolgende Karten gleicher Farbe
 * - Joker können jede Karte ersetzen
 */

const { RANK_INDEX } = require('./deck');

/**
 * Prüft ob eine Gruppe von Karten eine gültige Meldung ist.
 * @param {Card[]} cards - Die Karten der Meldung
 * @returns {{ valid: boolean, type: string|null, error: string|null }}
 */
function validateMeld(cards) {
  if (!cards || cards.length < 3) {
    return { valid: false, type: null, error: 'Mindestens 3 Karten erforderlich' };
  }

  for (let i = 1; i < cards.length; i++) {
    if (cards[i].isJoker && cards[i - 1].isJoker) {
      return { valid: false, type: null, error: 'Keine zwei Joker hintereinander erlaubt' };
    }
  }

  const jokers = cards.filter((c) => c.isJoker);
  const normalCards = cards.filter((c) => !c.isJoker);

  // Nur Joker ist ungültig
  if (normalCards.length === 0) {
    return { valid: false, type: null, error: 'Nicht nur Joker erlaubt' };
  }

  // Prüfe ob es ein Satz ist
  const setResult = validateSet(normalCards, jokers);
  if (setResult.valid) return setResult;

  // Prüfe ob es eine Folge ist
  const runResult = validateRun(normalCards, jokers);
  if (runResult.valid) return runResult;

  return { valid: false, type: null, error: 'Weder gültiger Satz noch gültige Folge' };
}

/**
 * Prüft ob die Karten einen gültigen Satz bilden (gleicher Rang, verschiedene Farben).
 */
function validateSet(normalCards, jokers) {
  const totalCards = normalCards.length + jokers.length;
  if (totalCards < 3 || totalCards > 4) {
    return { valid: false, type: 'satz', error: 'Satz muss 3 oder 4 Karten haben' };
  }

  if (jokers.length > 1) {
    return { valid: false, type: 'satz', error: 'Im Satz darf nur ein Joker verwendet werden' };
  }

  // Alle normalen Karten müssen gleichen Rang haben
  const rank = normalCards[0].rank;
  if (!normalCards.every((c) => c.rank === rank)) {
    return { valid: false, type: 'satz', error: 'Alle Karten im Satz müssen gleichen Rang haben' };
  }

  // Verschiedene Farben prüfen
  const suits = new Set(normalCards.map((c) => c.suit));
  if (suits.size !== normalCards.length) {
    return { valid: false, type: 'satz', error: 'Alle Karten im Satz müssen verschiedene Farben haben' };
  }

  return { valid: true, type: 'satz', error: null };
}

/**
 * Prüft ob die Karten eine gültige Folge bilden (aufeinanderfolgend, gleiche Farbe).
 * Unterstützt auch Umbruch-Folgen: K, A, 2, 3 oder A, 2, 3.
 */
function validateRun(normalCards, jokers) {
  const suit = normalCards[0].suit;
  if (!normalCards.every((c) => c.suit === suit)) {
    return { valid: false, type: 'folge', error: 'Alle Karten in einer Folge müssen gleiche Farbe haben' };
  }

  // Normale Folge (Ass ist hoch, Index 12)
  const normalResult = tryRunLinear(normalCards, jokers, false);
  if (normalResult.valid) return normalResult;

  // Umbruch-Folge: 2–10 werden auf 13–21 remapped, Ass bleibt 12 → K(11), A(12), 2(13), 3(14)…
  if (normalCards.some((c) => c.rank === 'ass')) {
    const wrapResult = tryRunLinear(normalCards, jokers, true);
    if (wrapResult.valid) return wrapResult;
  }

  return normalResult;
}

function tryRunLinear(normalCards, jokers, wrap) {
  const mapped = wrap
    ? normalCards.map((c) =>
        c.rankIndex <= 8 && c.rank !== 'ass' ? { ...c, rankIndex: c.rankIndex + 13 } : c
      )
    : normalCards;

  const sorted = [...mapped].sort((a, b) => a.rankIndex - b.rankIndex);
  const rankIndices = sorted.map((c) => c.rankIndex);

  // Keine doppelten Ränge
  if (new Set(rankIndices).size !== rankIndices.length) {
    return { valid: false, type: 'folge', error: 'Doppelte Karten in einer Folge nicht erlaubt' };
  }

  const minPos = rankIndices[0];
  const maxPos = rankIndices[rankIndices.length - 1];
  const totalNeeded = maxPos - minPos + 1;

  if (totalNeeded > normalCards.length + jokers.length) {
    return { valid: false, type: 'folge', error: 'Nicht genug Karten/Joker für die Folge' };
  }

  if (normalCards.length + jokers.length < 3) {
    return { valid: false, type: 'folge', error: 'Folge muss mindestens 3 Karten haben' };
  }

  const positionSet = new Set(rankIndices);
  let jokersUsed = 0;
  for (let i = minPos; i <= maxPos; i++) {
    if (!positionSet.has(i)) jokersUsed++;
  }

  if (jokersUsed > jokers.length) {
    return { valid: false, type: 'folge', error: 'Zu viele Lücken in der Folge' };
  }

  // Keine zwei Joker hintereinander: jede Lücke zwischen zwei normalen Karten darf höchstens 1 Joker enthalten
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].rankIndex - sorted[i - 1].rankIndex > 2) {
      return { valid: false, type: 'folge', error: 'Keine zwei Joker hintereinander erlaubt' };
    }
  }
  // Randjoker: maximal einer pro Seite (links / rechts)
  const boundaryJokers = jokers.length - jokersUsed;
  if (boundaryJokers > 2) {
    return { valid: false, type: 'folge', error: 'Keine zwei Joker hintereinander erlaubt' };
  }
  if (boundaryJokers === 2) {
    // Beide müssen auf verschiedene Seiten – nur möglich wenn je eine Seite frei ist
    const maxRank = wrap ? 21 : 12;
    if (minPos < 1 || maxPos >= maxRank) {
      return { valid: false, type: 'folge', error: 'Keine zwei Joker hintereinander erlaubt' };
    }
  }

  return { valid: true, type: 'folge', error: null };
}

// Rank index 0–12 → card value (2,3,...,9,10,10,10,10,11)
const RANK_VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 11];

function rankIndexToValue(ri, aceIsLow) {
  // Wrap remapping: low cards shifted +13 back to their real index
  const normalized = aceIsLow && ri >= 13 ? ri - 13 : ri;
  if (normalized === 12) return aceIsLow ? 1 : 11; // Ass
  if (normalized >= 0 && normalized < RANK_VALUES.length) return RANK_VALUES[normalized];
  return 0;
}

/**
 * Berechnet den Punktwert einer Meldung.
 * Joker zählen so viele Punkte wie die Karte, die sie ersetzen.
 * In einer Umbruch-Folge ohne König zählt das Ass nur 1 Punkt.
 */
function meldValue(cards) {
  const jokers = cards.filter((c) => c.isJoker);
  const normal = cards.filter((c) => !c.isJoker);
  if (normal.length === 0) return 0;

  const { valid: isSet } = validateSet(normal, jokers);
  const aceIsLow =
    !isSet &&
    normal.some((c) => c.rank === 'ass') &&
    normal.some((c) => c.rankIndex <= 8 && c.rank !== 'ass') &&
    !normal.some((c) => c.rank === 'koenig');

  const normalValue = normal.reduce((sum, c) => {
    if (aceIsLow && c.rank === 'ass') return sum + 1;
    return sum + c.value;
  }, 0);

  if (jokers.length === 0) return normalValue;

  if (isSet) {
    // Joker ersetzt gleichen Rang wie die anderen Karten im Satz
    return normalValue + jokers.length * normal[0].value;
  }

  // Folge: Joker-Positionen anhand der Reihenfolge ermitteln
  const adjIdx = (c) =>
    aceIsLow && c.rankIndex <= 8 && c.rank !== 'ass' ? c.rankIndex + 13 : c.rankIndex;
  const sortedNormal = [...normal].sort((a, b) => adjIdx(a) - adjIdx(b));
  const minRank = adjIdx(sortedNormal[0]);
  const maxRank = adjIdx(sortedNormal[sortedNormal.length - 1]);
  const usedRanks = new Set(sortedNormal.map(adjIdx));

  // Interne Lücken im Span
  const jokerRanks = [];
  for (let r = minRank; r <= maxRank; r++) {
    if (!usedRanks.has(r)) jokerRanks.push(r);
  }

  // Randjoker: Richtung aus der Reihenfolge der übergebenen Karten ableiten
  const boundaryCount = jokers.length - jokerRanks.length;
  if (boundaryCount > 0) {
    const firstNonJokerIdx = cards.findIndex((c) => !c.isJoker);
    const leadingCount = Math.min(firstNonJokerIdx, boundaryCount);
    const trailingCount = boundaryCount - leadingCount;
    for (let i = 0; i < leadingCount; i++) jokerRanks.push(minRank - 1 - i);
    for (let i = 0; i < trailingCount; i++) jokerRanks.push(maxRank + 1 + i);
  }

  const jokerValue = jokerRanks.reduce((sum, r) => sum + rankIndexToValue(r, aceIsLow), 0);
  return normalValue + jokerValue;
}

/**
 * Prüft ob eine Karte an eine bestehende Meldung angelegt werden kann.
 * @param {Card[]} existingMeld - Die bestehende Meldung
 * @param {Card} card - Die anzulegende Karte
 * @returns {boolean}
 */
function canAppendToMeld(existingMeld, card) {
  const newMeld = [...existingMeld, card];
  const result = validateMeld(newMeld);
  return result.valid;
}

module.exports = { validateMeld, validateSet, validateRun, meldValue, canAppendToMeld };
