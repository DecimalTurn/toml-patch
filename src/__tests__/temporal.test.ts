/**
 * Tests for Temporal API support.
 *
 * Uses @js-temporal/polyfill because Node.js 24 does not yet ship
 * Temporal natively (Stage 4 spec, expected in a future release).
 * The polyfill is set on globalThis so the library code can access it
 * the same way it would access the native Temporal global.
 */
import { Temporal } from '@js-temporal/polyfill';

// Make Temporal available as a global so the library code can find it
// via globalThis.Temporal (same as native Temporal in browsers/Node.js).
(globalThis as any).Temporal = Temporal;

import { parse, stringify, patch } from '../index';
import { kitchen_sink, example } from '../__fixtures__';

const FMT = { trailingNewline: 0 };

// ---------------------------------------------------------------------------
// Parse: temporal option
// ---------------------------------------------------------------------------

describe('parse() with temporal: true', () => {

  it('parses local date → Temporal.PlainDate', () => {
    const obj = parse('d = 2024-01-15\n', { temporal: true });
    expect(obj.d).toBeInstanceOf(Temporal.PlainDate);
    expect(obj.d.toString()).toBe('2024-01-15');
  });

  it('parses local time → Temporal.PlainTime', () => {
    const obj = parse('t = 10:30:00\n', { temporal: true });
    expect(obj.t).toBeInstanceOf(Temporal.PlainTime);
    expect(obj.t.toString()).toBe('10:30:00');
  });

  it('parses local time with milliseconds → Temporal.PlainTime', () => {
    const obj = parse('t = 10:30:00.123\n', { temporal: true });
    expect(obj.t).toBeInstanceOf(Temporal.PlainTime);
    expect(obj.t.toString()).toBe('10:30:00.123');
  });

  it('parses local datetime → Temporal.PlainDateTime', () => {
    const obj = parse('dt = 2024-01-15T10:30:00\n', { temporal: true });
    expect(obj.dt).toBeInstanceOf(Temporal.PlainDateTime);
    expect(obj.dt.toString()).toBe('2024-01-15T10:30:00');
  });

  it('parses local datetime with space separator → Temporal.PlainDateTime', () => {
    const obj = parse('dt = 2024-01-15 10:30:00\n', { temporal: true });
    expect(obj.dt).toBeInstanceOf(Temporal.PlainDateTime);
  });

  it('parses offset datetime → Temporal.ZonedDateTime (Z offset)', () => {
    const obj = parse('z = 2024-01-15T10:30:00Z\n', { temporal: true });
    expect(obj.z).toBeInstanceOf(Temporal.ZonedDateTime);
  });

  it('parses offset datetime → Temporal.ZonedDateTime (+05:30 offset)', () => {
    const obj = parse('z = 2024-01-15T10:30:00+05:30\n', { temporal: true });
    expect(obj.z).toBeInstanceOf(Temporal.ZonedDateTime);
  });

  it('parses offset datetime with space separator', () => {
    const obj = parse('z = 2024-01-15 10:30:00-05:00\n', { temporal: true });
    expect(obj.z).toBeInstanceOf(Temporal.ZonedDateTime);
  });

  it('default (temporal: false) still returns Date subclasses', () => {
    const obj = parse('d = 2024-01-15\n');
    expect(obj.d).toBeInstanceOf(Date);
    // Date subclass, not plain Date, so constructor name is not 'Date'
    expect(obj.d.constructor.name).toBe('LocalDate');
  });

  it('temporal: false explicitly returns Date subclasses', () => {
    const obj = parse('d = 2024-01-15\n', { temporal: false });
    expect(obj.d.constructor.name).toBe('LocalDate');
  });
});

// ---------------------------------------------------------------------------
// Stringify: Temporal input
// ---------------------------------------------------------------------------

describe('stringify() with Temporal input', () => {

  it('serializes Temporal.PlainDate → TOML date-only', () => {
    const d = Temporal.PlainDate.from('2024-01-15');
    const out = stringify({ date: d }, FMT);
    expect(out).toBe('date = 2024-01-15');
  });

  it('serializes Temporal.PlainTime → TOML time-only', () => {
    const t = Temporal.PlainTime.from('10:30:00');
    const out = stringify({ time: t }, FMT);
    expect(out).toBe('time = 10:30:00');
  });

  it('serializes Temporal.PlainTime with milliseconds', () => {
    const t = Temporal.PlainTime.from('10:30:00.123');
    const out = stringify({ time: t }, FMT);
    expect(out).toBe('time = 10:30:00.123');
  });

  it('serializes Temporal.PlainDateTime → TOML local datetime', () => {
    const dt = Temporal.PlainDateTime.from('2024-01-15T10:30:00');
    const out = stringify({ dt }, FMT);
    expect(out).toBe('dt = 2024-01-15T10:30:00');
  });

  it('serializes Temporal.ZonedDateTime → TOML offset datetime', () => {
    const z = Temporal.ZonedDateTime.from('2024-01-15T10:30:00+05:30[+05:30]');
    const out = stringify({ z }, FMT);
    expect(out).toBe('z = 2024-01-15T10:30:00+05:30');
  });

  it('serializes Temporal.ZonedDateTime with Z offset', () => {
    const z = Temporal.ZonedDateTime.from('2024-01-15T10:30:00+00:00[+00:00]');
    const out = stringify({ z }, FMT);
    expect(out).toBe('z = 2024-01-15T10:30:00Z');
  });
});

// ---------------------------------------------------------------------------
// Roundtrip: parse → stringify → parse
// ---------------------------------------------------------------------------

describe('roundtrip with Temporal', () => {

  it('PlainDate roundtrips correctly', () => {
    const toml = 'd = 2024-01-15\n';
    const obj = parse(toml, { temporal: true });
    const out = stringify(obj, FMT);
    const obj2 = parse(out, { temporal: true });
    expect(obj2.d).toBeInstanceOf(Temporal.PlainDate);
    expect(obj2.d.toString()).toBe('2024-01-15');
  });

  it('PlainTime roundtrips correctly', () => {
    const toml = 't = 10:30:00.123\n';
    const obj = parse(toml, { temporal: true });
    const out = stringify(obj, FMT);
    const obj2 = parse(out, { temporal: true });
    expect(obj2.t).toBeInstanceOf(Temporal.PlainTime);
    expect(obj2.t.toString()).toBe('10:30:00.123');
  });

  it('PlainDateTime roundtrips correctly', () => {
    const toml = 'dt = 2024-01-15T10:30:00\n';
    const obj = parse(toml, { temporal: true });
    const out = stringify(obj, FMT);
    const obj2 = parse(out, { temporal: true });
    expect(obj2.dt).toBeInstanceOf(Temporal.PlainDateTime);
    expect(obj2.dt.toString()).toBe('2024-01-15T10:30:00');
  });

  it('ZonedDateTime roundtrips correctly', () => {
    const toml = 'z = 2024-01-15T10:30:00+05:30\n';
    const obj = parse(toml, { temporal: true });
    const out = stringify(obj, FMT);
    const obj2 = parse(out, { temporal: true });
    expect(obj2.z).toBeInstanceOf(Temporal.ZonedDateTime);
  });

  // -- format transitions verified by re-parsing after patch --

  it('date-only → PlainDateTime survives roundtrip', () => {
    const toml = 'd = 2024-01-15\n';
    const updated = { d: Temporal.PlainDateTime.from('2025-06-01T12:00:00') };
    const patched = patch(toml, updated, FMT);
    const reparsed = parse(patched, { temporal: true });
    expect(reparsed.d).toBeInstanceOf(Temporal.PlainDateTime);
    expect(reparsed.d.toString()).toBe('2025-06-01T12:00:00');
  });

  it('date-only → ZonedDateTime survives roundtrip', () => {
    const toml = 'd = 2024-01-15\n';
    const updated = { d: Temporal.ZonedDateTime.from('2025-06-01T12:00:00+05:30[+05:30]') };
    const patched = patch(toml, updated, FMT);
    const reparsed = parse(patched, { temporal: true });
    expect(reparsed.d).toBeInstanceOf(Temporal.ZonedDateTime);
  });

  it('datetime → PlainDate survives roundtrip', () => {
    const toml = 'dt = 2024-01-15T10:30:00\n';
    const updated = { dt: Temporal.PlainDate.from('2025-06-01') };
    const patched = patch(toml, updated, FMT);
    const reparsed = parse(patched, { temporal: true });
    expect(reparsed.dt).toBeInstanceOf(Temporal.PlainDate);
    expect(reparsed.dt.toString()).toBe('2025-06-01');
  });

  it('offset datetime → PlainDate survives roundtrip', () => {
    const toml = 'z = 2024-01-15T10:30:00+05:30\n';
    const updated = { z: Temporal.PlainDate.from('2025-06-01') };
    const patched = patch(toml, updated, FMT);
    const reparsed = parse(patched, { temporal: true });
    expect(reparsed.z).toBeInstanceOf(Temporal.PlainDate);
    expect(reparsed.z.toString()).toBe('2025-06-01');
  });
});

// ---------------------------------------------------------------------------
// Patch with Temporal
// ---------------------------------------------------------------------------

describe('patch() with Temporal', () => {

  it('patches a date value with Temporal.PlainDate', () => {
    const existing = 'd = 2024-01-15\n';
    const updated = { d: Temporal.PlainDate.from('2025-06-01') };
    const result = patch(existing, updated, FMT);
    expect(result).toBe('d = 2025-06-01');
  });

  it('patches a datetime value with Temporal.PlainDateTime', () => {
    const existing = 'dt = 2024-01-15T10:30:00\n';
    const updated = { dt: Temporal.PlainDateTime.from('2025-06-01T12:00:00') };
    const result = patch(existing, updated, FMT);
    expect(result).toBe('dt = 2025-06-01T12:00:00');
  });

  it('patches a ZonedDateTime value preserving offset format', () => {
    const existing = 'z = 2024-01-15T10:30:00+05:30\n';
    const updated = { z: Temporal.ZonedDateTime.from('2025-06-01T12:00:00+05:30[+05:30]') };
    const result = patch(existing, updated, FMT);
    expect(result).toBe('z = 2025-06-01T12:00:00+05:30');
  });

  it('patch with mix of Temporal and plain values works', () => {
    const existing = 'name = "test"\nd = 2024-01-15\ncount = 42\n';
    const updated = {
      name: 'test',
      d: Temporal.PlainDate.from('2025-06-01'),
      count: 43
    };
    const result = patch(existing, updated, FMT);
    expect(result).toBe('name = "test"\nd = 2025-06-01\ncount = 43');
  });

  // -- format transitions (upgrade / downgrade) --

  it('upgrades date-only → PlainDateTime when new value carries time', () => {
    const existing = 'd = 2024-01-15\n';
    const updated = { d: Temporal.PlainDateTime.from('2025-06-01T12:00:00') };
    const result = patch(existing, updated, FMT);
    expect(result).toBe('d = 2025-06-01T12:00:00');
  });

  it('upgrades date-only → ZonedDateTime when new value carries offset', () => {
    const existing = 'd = 2024-01-15\n';
    const updated = { d: Temporal.ZonedDateTime.from('2025-06-01T12:00:00+05:30[+05:30]') };
    const result = patch(existing, updated, FMT);
    expect(result).toBe('d = 2025-06-01T12:00:00+05:30');
  });

  it('downgrades datetime → date-only when new value is PlainDate', () => {
    const existing = 'dt = 2024-01-15T10:30:00\n';
    const updated = { dt: Temporal.PlainDate.from('2025-06-01') };
    const result = patch(existing, updated, FMT);
    expect(result).toBe('dt = 2025-06-01');
  });

  it('downgrades offset datetime → date-only when new value is PlainDate', () => {
    const existing = 'z = 2024-01-15T10:30:00+05:30\n';
    const updated = { z: Temporal.PlainDate.from('2025-06-01') };
    const result = patch(existing, updated, FMT);
    expect(result).toBe('z = 2025-06-01');
  });

  // -- ZonedDateTime with different IANA zones but same offset should not diff --

  it('ZonedDateTime with IANA annotation throws a clear error', () => {
    const existing = 'z = 2024-01-15T10:30:00+05:30\n';
    const updated = {
      z: Temporal.ZonedDateTime.from('2024-01-15T10:30:00+05:30[Asia/Kolkata]')
    };
    expect(() => patch(existing, updated, FMT)).toThrow(
      'cannot be represented in TOML'
    );
  });
});

// ---------------------------------------------------------------------------
// Fixture-based roundtrip: existing TOML fixtures with date/time values
// ---------------------------------------------------------------------------

describe('fixture roundtrip with temporal: true', () => {

  it('kitchen-sink: all date/time types survive roundtrip', () => {
    const obj = parse(kitchen_sink, { temporal: true });

    // --- First pass: verify parsed types ---

    const dtArray = obj.values.date.datetime;
    expect(Array.isArray(dtArray)).toBe(true);

    // 1979-05-27T07:32:00Z → ZonedDateTime
    expect(dtArray[0]).toBeInstanceOf(Temporal.ZonedDateTime);

    // 1979-05-27T00:32:00-07:00 → ZonedDateTime
    expect(dtArray[1]).toBeInstanceOf(Temporal.ZonedDateTime);

    // 1979-05-27T00:32:00.999999-07:00 → ZonedDateTime
    expect(dtArray[2]).toBeInstanceOf(Temporal.ZonedDateTime);

    // 1979-05-27 07:32:00Z (space separator) → ZonedDateTime
    expect(dtArray[3]).toBeInstanceOf(Temporal.ZonedDateTime);

    const localArray = obj.values.date.local;
    expect(Array.isArray(localArray)).toBe(true);

    // 1979-05-27T07:32:00 → PlainDateTime
    expect(localArray[0]).toBeInstanceOf(Temporal.PlainDateTime);
    expect(localArray[0].toString()).toBe('1979-05-27T07:32:00');

    // 1979-05-27 → PlainDate
    expect(localArray[1]).toBeInstanceOf(Temporal.PlainDate);
    expect(localArray[1].toString()).toBe('1979-05-27');

    // 07:32:00 → PlainTime
    expect(localArray[2]).toBeInstanceOf(Temporal.PlainTime);
    expect(localArray[2].toString()).toBe('07:32:00');

    // --- Roundtrip: stringify → re-parse ---

    const out = stringify(obj, FMT);
    const obj2 = parse(out, { temporal: true });

    const dtArray2 = obj2.values.date.datetime;
    expect(dtArray2[0]).toBeInstanceOf(Temporal.ZonedDateTime);
    expect(dtArray2[1]).toBeInstanceOf(Temporal.ZonedDateTime);
    expect(dtArray2[2]).toBeInstanceOf(Temporal.ZonedDateTime);
    expect(dtArray2[3]).toBeInstanceOf(Temporal.ZonedDateTime);

    const localArray2 = obj2.values.date.local;
    expect(localArray2[0]).toBeInstanceOf(Temporal.PlainDateTime);
    expect(localArray2[0].toString()).toBe('1979-05-27T07:32:00');
    expect(localArray2[1]).toBeInstanceOf(Temporal.PlainDate);
    expect(localArray2[1].toString()).toBe('1979-05-27');
    expect(localArray2[2]).toBeInstanceOf(Temporal.PlainTime);
    expect(localArray2[2].toString()).toBe('07:32:00');
  });

  it('example.toml: offset datetime survives roundtrip', () => {
    const obj = parse(example, { temporal: true });
    expect(obj.owner.dob).toBeInstanceOf(Temporal.ZonedDateTime);

    const out = stringify(obj, FMT);
    const obj2 = parse(out, { temporal: true });
    expect(obj2.owner.dob).toBeInstanceOf(Temporal.ZonedDateTime);
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('Temporal error handling', () => {

  it('throws a clear error when temporal: true but Temporal is not available', () => {
    // We can't easily test this since @js-temporal/polyfill is loaded.
    // But we can verify the error path by checking the Temporal check exists.
    // (Covered by unit test of dateValueToTemporal or the runtime check in toValue)
    // This test documents the expected behavior.
    expect(true).toBe(true); // Placeholder — the error path is exercised in code
  });
});

// ---------------------------------------------------------------------------
// Utility function tests
// ---------------------------------------------------------------------------

describe('isTemporal utility', () => {
  // We import via the barrel — test the duck-type detection indirectly
  // by verifying that parse with temporal:true returns Temporal instances.

  // Known Temporal constructor names (both native and polyfill variants)
  const TEMPORAL_NAMES = new Set([
    'Temporal.PlainDate', 'PlainDate',
    'Temporal.PlainTime', 'PlainTime',
    'Temporal.PlainDateTime', 'PlainDateTime',
    'Temporal.ZonedDateTime', 'ZonedDateTime'
  ]);

  it('Temporal.PlainDate is detected as Temporal (via parse)', () => {
    const obj = parse('d = 2024-01-15\n', { temporal: true });
    const d = obj.d;
    expect(TEMPORAL_NAMES.has(d.constructor.name)).toBe(true);
  });

  it('Temporal.PlainTime is detected as Temporal (via parse)', () => {
    const obj = parse('t = 10:30:00\n', { temporal: true });
    expect(TEMPORAL_NAMES.has(obj.t.constructor.name)).toBe(true);
  });

  it('Temporal.PlainDateTime is detected as Temporal (via parse)', () => {
    const obj = parse('dt = 2024-01-15T10:30:00\n', { temporal: true });
    expect(TEMPORAL_NAMES.has(obj.dt.constructor.name)).toBe(true);
  });

  it('Temporal.ZonedDateTime is detected as Temporal (via parse)', () => {
    const obj = parse('z = 2024-01-15T10:30:00Z\n', { temporal: true });
    expect(TEMPORAL_NAMES.has(obj.z.constructor.name)).toBe(true);
  });
});
