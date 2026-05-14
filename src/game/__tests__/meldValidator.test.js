'use strict';

const { Card } = require('../deck');
const { validateMeld, meldValue, canAppendToMeld } = require('../meldValidator');

const c = (rank, suit, idx = 0) => new Card(suit, rank, idx);
const joker = (idx = 0) => new Card('joker', 'joker', idx);

// ---------------------------------------------------------------------------
// validateMeld
// ---------------------------------------------------------------------------

describe('validateMeld', () => {
  describe('valid satz (set)', () => {
    test('3 aces of different suits', () => {
      const result = validateMeld([c('ass', 'herz'), c('ass', 'karo'), c('ass', 'pik')]);
      expect(result).toMatchObject({ valid: true, type: 'satz' });
    });

    test('4 dames (all suits)', () => {
      const result = validateMeld([
        c('dame', 'herz'), c('dame', 'karo'), c('dame', 'pik'), c('dame', 'kreuz'),
      ]);
      expect(result).toMatchObject({ valid: true, type: 'satz' });
    });

    test('3 koenige with joker substituting the 4th suit', () => {
      const result = validateMeld([c('koenig', 'herz'), c('koenig', 'pik'), joker()]);
      expect(result).toMatchObject({ valid: true, type: 'satz' });
    });
  });

  describe('valid folge (run)', () => {
    test('7-8-9 of herz', () => {
      const result = validateMeld([c('7', 'herz'), c('8', 'herz'), c('9', 'herz')]);
      expect(result).toMatchObject({ valid: true, type: 'folge' });
    });

    test('7-joker-9 of herz', () => {
      const result = validateMeld([c('7', 'herz'), joker(), c('9', 'herz')]);
      expect(result).toMatchObject({ valid: true, type: 'folge' });
    });

    test('koenig-ass of herz with leading joker (joker-koenig-ass)', () => {
      const result = validateMeld([joker(), c('koenig', 'herz'), c('ass', 'herz')]);
      expect(result).toMatchObject({ valid: true, type: 'folge' });
    });

    test('joker-3-4-5-6-7-joker of herz: two boundary jokers, one per side', () => {
      const result = validateMeld([
        joker(0), c('3', 'herz'), c('4', 'herz'), c('5', 'herz'), c('6', 'herz'), c('7', 'herz'), joker(1),
      ]);
      expect(result).toMatchObject({ valid: true, type: 'folge' });
    });

    test('joker-dame-joker-ass of herz: jokers not adjacent (bube and koenig slots)', () => {
      const result = validateMeld([joker(0), c('dame', 'herz'), joker(1), c('ass', 'herz')]);
      expect(result).toMatchObject({ valid: true, type: 'folge' });
    });
  });

  describe('invalid melds – adjacent jokers', () => {
    test('joker-joker-koenig-ass of herz: two jokers must not be adjacent', () => {
      const result = validateMeld([joker(0), joker(1), c('koenig', 'herz'), c('ass', 'herz')]);
      expect(result).toMatchObject({ valid: false });
    });
  });

  describe('invalid melds', () => {
    test('only 2 cards', () => {
      const result = validateMeld([c('ass', 'herz'), c('ass', 'karo')]);
      expect(result).toMatchObject({ valid: false });
    });

    test('3 cards of same suit with gaps too large for a run', () => {
      // ass(12), dame(10), 9(7) — span of 6, needs 4 extra cards, no jokers → invalid
      const result = validateMeld([c('ass', 'herz'), c('dame', 'herz'), c('9', 'herz')]);
      expect(result).toMatchObject({ valid: false });
    });

    test('non-consecutive run without joker (7, 9, bube of herz)', () => {
      const result = validateMeld([c('7', 'herz'), c('9', 'herz'), c('bube', 'herz')]);
      expect(result).toMatchObject({ valid: false });
    });

    test('empty array', () => {
      const result = validateMeld([]);
      expect(result).toMatchObject({ valid: false });
    });
  });
});

// ---------------------------------------------------------------------------
// meldValue
// ---------------------------------------------------------------------------

describe('meldValue', () => {
  test('3× dame = 30', () => {
    expect(meldValue([c('dame', 'herz'), c('dame', 'karo'), c('dame', 'pik')])).toBe(30);
  });

  test('3× ass (satz) = 33', () => {
    expect(meldValue([c('ass', 'herz'), c('ass', 'karo'), c('ass', 'pik')])).toBe(33);
  });

  test('ass-2-3 of herz: ace counts as 1 (low wrap), total = 6', () => {
    expect(meldValue([c('ass', 'herz'), c('2', 'herz'), c('3', 'herz')])).toBe(6);
  });

  test('7-8-9 of herz = 24', () => {
    expect(meldValue([c('7', 'herz'), c('8', 'herz'), c('9', 'herz')])).toBe(24);
  });

  test('joker in satz of 10s: joker counts as 10, total = 30', () => {
    expect(meldValue([c('10', 'herz'), c('10', 'karo'), joker()])).toBe(30);
  });

  test('4× dame (all suits) = 40', () => {
    expect(meldValue([
      c('dame', 'herz'), c('dame', 'karo'), c('dame', 'pik'), c('dame', 'kreuz'),
    ])).toBe(40);
  });

  test('10-bube-dame-koenig of herz = 40', () => {
    expect(meldValue([
      c('10', 'herz'), c('bube', 'herz'), c('dame', 'herz'), c('koenig', 'herz'),
    ])).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// canAppendToMeld
// ---------------------------------------------------------------------------

describe('canAppendToMeld', () => {
  const run789 = [c('7', 'herz'), c('8', 'herz'), c('9', 'herz')];
  const satzAss = [c('ass', 'herz'), c('ass', 'pik'), c('ass', 'karo')];

  test('extend run at high end: [7,8,9-herz] + 10-herz', () => {
    expect(canAppendToMeld(run789, c('10', 'herz'))).toBe(true);
  });

  test('extend run at low end: [7,8,9-herz] + 6-herz', () => {
    expect(canAppendToMeld(run789, c('6', 'herz'))).toBe(true);
  });

  test('complete satz: [ass-herz/pik/karo] + ass-kreuz', () => {
    expect(canAppendToMeld(satzAss, c('ass', 'kreuz'))).toBe(true);
  });

  test('wrong suit for run: [7,8,9-herz] + 10-pik', () => {
    expect(canAppendToMeld(run789, c('10', 'pik'))).toBe(false);
  });

  test('gap in run: [7,8,9-herz] + bube-herz (10 missing)', () => {
    expect(canAppendToMeld(run789, c('bube', 'herz'))).toBe(false);
  });

  describe('with jokers in existing meld', () => {
    const runJokerInternal = [c('7', 'herz'), joker(), c('9', 'herz')]; // joker = 8
    const runJokerLeftBoundary = [joker(), c('8', 'herz'), c('9', 'herz')]; // joker = 7
    const runTwoBoundaryJokers = [joker(0), c('3', 'herz'), c('4', 'herz'), c('5', 'herz'), c('6', 'herz'), c('7', 'herz'), joker(1)];

    test('[7, J, 9] herz + 10-herz: extend right, joker stays internal', () => {
      expect(canAppendToMeld(runJokerInternal, c('10', 'herz'))).toBe(true);
    });

    test('[7, J, 9] herz + 6-herz: extend left, joker stays internal', () => {
      expect(canAppendToMeld(runJokerInternal, c('6', 'herz'))).toBe(true);
    });

    test('[J, 8, 9] herz + 7-herz: card fills joker boundary position', () => {
      expect(canAppendToMeld(runJokerLeftBoundary, c('7', 'herz'))).toBe(true);
    });

    test('[J, 8, 9] herz + 10-herz: extend right, joker stays left boundary', () => {
      expect(canAppendToMeld(runJokerLeftBoundary, c('10', 'herz'))).toBe(true);
    });

    test('[7, J, 9] herz + bube-herz: gap too large (10 missing), invalid', () => {
      expect(canAppendToMeld(runJokerInternal, c('bube', 'herz'))).toBe(false);
    });

    test('[J, 3..7, J] herz + 2-herz: no room left of rank index 0, invalid', () => {
      expect(canAppendToMeld(runTwoBoundaryJokers, c('2', 'herz'))).toBe(false);
    });

    test('[J, 3..7, J] herz + 8-herz: extend right, valid', () => {
      expect(canAppendToMeld(runTwoBoundaryJokers, c('8', 'herz'))).toBe(true);
    });
  });
});
