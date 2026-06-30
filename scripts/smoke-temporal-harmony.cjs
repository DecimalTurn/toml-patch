/**
 * Smoke test: comprehensive Temporal API surface probe.
 *
 * Requires --harmony-temporal flag on Node 18-24 (native on Node 26+).
 * Reports which Temporal features are present by version, so CI can
 * track V8's evolving implementation across Node releases.
 *
 * Usage: node --harmony-temporal scripts/smoke-temporal-harmony.cjs
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
test('Instant.compare', () => { Temporal.Instant.compare(inst, inst); });
test('Instant.epochMilliseconds', () => { inst.epochMilliseconds; });
test('Instant.epochNanoseconds', () => { inst.epochNanoseconds; });
test('Instant.add', () => { inst.add({ hours: 1 }); });
test('Instant.subtract', () => { inst.subtract({ hours: 1 }); });
test('Instant.until', () => { inst.until(inst); });
test('Instant.since', () => { inst.since(inst); });
test('Instant.round', () => { inst.round({ smallestUnit: 'minute' }); });
test('Instant.equals', () => { inst.equals(inst); });
test('Instant.toString', () => { inst.toString(); });
test('Instant.toJSON', () => { inst.toJSON(); });
test('Instant.toLocaleString', () => { inst.toLocaleString(); });
test('Instant.toZonedDateTimeISO', () => { inst.toZonedDateTimeISO('UTC'); });
test('Instant.valueOf throws', () => {
  try { inst.valueOf(); throw new Error('should have thrown'); }
  catch(e) { if(e.message === 'should have thrown') throw e; }
});

// --- Temporal.Now ---
test('Now.instant', () => { Temporal.Now.instant(); });
test('Now.timeZoneId', () => { Temporal.Now.timeZoneId(); });
test('Now.plainDateISO', () => { Temporal.Now.plainDateISO(); });
test('Now.plainDateTimeISO', () => { Temporal.Now.plainDateTimeISO(); });
test('Now.plainTimeISO', () => { Temporal.Now.plainTimeISO(); });
test('Now.zonedDateTimeISO', () => { Temporal.Now.zonedDateTimeISO(); });

// --- Temporal.PlainDate ---
const pd = Temporal.PlainDate.from('2024-01-15');
test('PlainDate constructor', () => { new Temporal.PlainDate(2024, 1, 15); });
test('PlainDate.from', () => { Temporal.PlainDate.from('2024-01-15'); });
test('PlainDate.compare', () => { Temporal.PlainDate.compare(pd, pd); });
test('PlainDate.year', () => { if(pd.year !== 2024) throw new Error('wrong value'); });
test('PlainDate.month', () => { if(pd.month !== 1) throw new Error('wrong value'); });
test('PlainDate.day', () => { if(pd.day !== 15) throw new Error('wrong value'); });
test('PlainDate.calendarId', () => { pd.calendarId; });
test('PlainDate.dayOfWeek', () => { pd.dayOfWeek; });
test('PlainDate.dayOfYear', () => { pd.dayOfYear; });
test('PlainDate.weekOfYear', () => { pd.weekOfYear; });
test('PlainDate.yearOfWeek', () => { pd.yearOfWeek; });
test('PlainDate.daysInWeek', () => { pd.daysInWeek; });
test('PlainDate.daysInMonth', () => { pd.daysInMonth; });
test('PlainDate.daysInYear', () => { pd.daysInYear; });
test('PlainDate.monthsInYear', () => { pd.monthsInYear; });
test('PlainDate.inLeapYear', () => { pd.inLeapYear; });
test('PlainDate.era', () => { pd.era; });
test('PlainDate.eraYear', () => { pd.eraYear; });
test('PlainDate.monthCode', () => { pd.monthCode; });
test('PlainDate.equals', () => { pd.equals(pd); });
test('PlainDate.add', () => { pd.add({ days: 1 }); });
test('PlainDate.subtract', () => { pd.subtract({ days: 1 }); });
test('PlainDate.with', () => { pd.with({ day: 20 }); });
test('PlainDate.withCalendar', () => { pd.withCalendar('iso8601'); });
test('PlainDate.until', () => { pd.until(pd); });
test('PlainDate.since', () => { pd.since(pd); });
test('PlainDate.toPlainDateTime', () => { pd.toPlainDateTime(); });
test('PlainDate.toPlainMonthDay', () => { pd.toPlainMonthDay(); });
test('PlainDate.toPlainYearMonth', () => { pd.toPlainYearMonth(); });
test('PlainDate.toZonedDateTime', () => { pd.toZonedDateTime('UTC'); });
test('PlainDate.toString', () => { pd.toString(); });
test('PlainDate.toJSON', () => { pd.toJSON(); });
test('PlainDate.toLocaleString', () => { pd.toLocaleString(); });
test('PlainDate.valueOf throws', () => {
  try { pd.valueOf(); throw new Error('should have thrown'); }
  catch(e) { if(e.message === 'should have thrown') throw e; }
});

// --- Temporal.PlainTime ---
const pt = Temporal.PlainTime.from('12:30:45.123456789');
test('PlainTime constructor', () => { new Temporal.PlainTime(12, 30); });
test('PlainTime.from', () => { Temporal.PlainTime.from('12:30:00'); });
test('PlainTime.compare', () => { Temporal.PlainTime.compare(pt, pt); });
test('PlainTime.hour', () => { if(pt.hour !== 12) throw new Error('wrong value'); });
test('PlainTime.minute', () => { if(pt.minute !== 30) throw new Error('wrong value'); });
test('PlainTime.second', () => { if(pt.second !== 45) throw new Error('wrong value'); });
test('PlainTime.millisecond', () => { if(pt.millisecond !== 123) throw new Error('wrong value'); });
test('PlainTime.microsecond', () => { if(pt.microsecond !== 456) throw new Error('wrong value'); });
test('PlainTime.nanosecond', () => { if(pt.nanosecond !== 789) throw new Error('wrong value'); });
test('PlainTime.equals', () => { pt.equals(pt); });
test('PlainTime.add', () => { pt.add({ hours: 1 }); });
test('PlainTime.subtract', () => { pt.subtract({ hours: 1 }); });
test('PlainTime.with', () => { pt.with({ hour: 9 }); });
test('PlainTime.until', () => { pt.until(pt); });
test('PlainTime.since', () => { pt.since(pt); });
test('PlainTime.round', () => { pt.round({ smallestUnit: 'minute' }); });
test('PlainTime.toString', () => { pt.toString(); });
test('PlainTime.toJSON', () => { pt.toJSON(); });
test('PlainTime.toLocaleString', () => { pt.toLocaleString(); });
test('PlainTime.valueOf throws', () => {
  try { pt.valueOf(); throw new Error('should have thrown'); }
  catch(e) { if(e.message === 'should have thrown') throw e; }
});

// --- Temporal.PlainDateTime ---
const pdt = Temporal.PlainDateTime.from('2024-01-15T12:30:45');
test('PlainDateTime constructor', () => { new Temporal.PlainDateTime(2024, 1, 15, 12, 30); });
test('PlainDateTime.from', () => { Temporal.PlainDateTime.from('2024-01-15T12:30:45'); });
test('PlainDateTime.compare', () => { Temporal.PlainDateTime.compare(pdt, pdt); });
test('PlainDateTime.year', () => { if(pdt.year !== 2024) throw new Error('wrong value'); });
test('PlainDateTime.month', () => { if(pdt.month !== 1) throw new Error('wrong value'); });
test('PlainDateTime.day', () => { if(pdt.day !== 15) throw new Error('wrong value'); });
test('PlainDateTime.hour', () => { if(pdt.hour !== 12) throw new Error('wrong value'); });
test('PlainDateTime.minute', () => { if(pdt.minute !== 30) throw new Error('wrong value'); });
test('PlainDateTime.second', () => { if(pdt.second !== 45) throw new Error('wrong value'); });
test('PlainDateTime.millisecond', () => { pdt.millisecond; });
test('PlainDateTime.microsecond', () => { pdt.microsecond; });
test('PlainDateTime.nanosecond', () => { pdt.nanosecond; });
test('PlainDateTime.calendarId', () => { pdt.calendarId; });
test('PlainDateTime.dayOfWeek', () => { pdt.dayOfWeek; });
test('PlainDateTime.dayOfYear', () => { pdt.dayOfYear; });
test('PlainDateTime.weekOfYear', () => { pdt.weekOfYear; });
test('PlainDateTime.yearOfWeek', () => { pdt.yearOfWeek; });
test('PlainDateTime.daysInWeek', () => { pdt.daysInWeek; });
test('PlainDateTime.daysInMonth', () => { pdt.daysInMonth; });
test('PlainDateTime.daysInYear', () => { pdt.daysInYear; });
test('PlainDateTime.monthsInYear', () => { pdt.monthsInYear; });
test('PlainDateTime.inLeapYear', () => { pdt.inLeapYear; });
test('PlainDateTime.era', () => { pdt.era; });
test('PlainDateTime.eraYear', () => { pdt.eraYear; });
test('PlainDateTime.monthCode', () => { pdt.monthCode; });
test('PlainDateTime.equals', () => { pdt.equals(pdt); });
test('PlainDateTime.add', () => { pdt.add({ days: 1 }); });
test('PlainDateTime.subtract', () => { pdt.subtract({ days: 1 }); });
test('PlainDateTime.with', () => { pdt.with({ year: 2025 }); });
test('PlainDateTime.withCalendar', () => { pdt.withCalendar('iso8601'); });
test('PlainDateTime.withPlainTime', () => { pdt.withPlainTime({ hour: 9 }); });
test('PlainDateTime.until', () => { pdt.until(pdt); });
test('PlainDateTime.since', () => { pdt.since(pdt); });
test('PlainDateTime.round', () => { pdt.round({ smallestUnit: 'minute' }); });
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

// --- Temporal.PlainYearMonth ---
const pym = Temporal.PlainYearMonth.from('2024-01');
test('PlainYearMonth constructor', () => { new Temporal.PlainYearMonth(2024, 1); });
test('PlainYearMonth.from', () => { Temporal.PlainYearMonth.from('2024-01'); });
test('PlainYearMonth.compare', () => { Temporal.PlainYearMonth.compare(pym, pym); });
test('PlainYearMonth.year', () => { if(pym.year !== 2024) throw new Error('wrong value'); });
test('PlainYearMonth.month', () => { if(pym.month !== 1) throw new Error('wrong value'); });
test('PlainYearMonth.calendarId', () => { pym.calendarId; });
test('PlainYearMonth.monthCode', () => { pym.monthCode; });
test('PlainYearMonth.daysInMonth', () => { pym.daysInMonth; });
test('PlainYearMonth.daysInYear', () => { pym.daysInYear; });
test('PlainYearMonth.monthsInYear', () => { pym.monthsInYear; });
test('PlainYearMonth.inLeapYear', () => { pym.inLeapYear; });
test('PlainYearMonth.era', () => { pym.era; });
test('PlainYearMonth.eraYear', () => { pym.eraYear; });
test('PlainYearMonth.equals', () => { pym.equals(pym); });
test('PlainYearMonth.add', () => { pym.add({ months: 1 }); });
test('PlainYearMonth.subtract', () => { pym.subtract({ months: 1 }); });
test('PlainYearMonth.with', () => { pym.with({ month: 6 }); });
test('PlainYearMonth.until', () => { pym.until(pym); });
test('PlainYearMonth.since', () => { pym.since(pym); });
test('PlainYearMonth.toPlainDate', () => { pym.toPlainDate({ day: 1 }); });
test('PlainYearMonth.toString', () => { pym.toString(); });
test('PlainYearMonth.toJSON', () => { pym.toJSON(); });
test('PlainYearMonth.toLocaleString', () => { pym.toLocaleString('en-US', { calendar: 'iso8601' }); });
test('PlainYearMonth.valueOf throws', () => {
  try { pym.valueOf(); throw new Error('should have thrown'); }
  catch(e) { if(e.message === 'should have thrown') throw e; }
});

// --- Temporal.PlainMonthDay ---
const pmd = Temporal.PlainMonthDay.from('01-15');
test('PlainMonthDay constructor', () => { new Temporal.PlainMonthDay(1, 15); });
test('PlainMonthDay.from', () => { Temporal.PlainMonthDay.from('01-15'); });
test('PlainMonthDay.monthCode', () => { pmd.monthCode; });
test('PlainMonthDay.day', () => { if(pmd.day !== 15) throw new Error('wrong value'); });
test('PlainMonthDay.calendarId', () => { pmd.calendarId; });
test('PlainMonthDay.equals', () => { pmd.equals(pmd); });
test('PlainMonthDay.with', () => { pmd.with({ day: 20 }); });
test('PlainMonthDay.toPlainDate', () => { pmd.toPlainDate({ year: 2024 }); });
test('PlainMonthDay.toString', () => { pmd.toString(); });
test('PlainMonthDay.toJSON', () => { pmd.toJSON(); });
test('PlainMonthDay.toLocaleString', () => { pmd.toLocaleString('en-US', { calendar: 'iso8601' }); });
test('PlainMonthDay.valueOf throws', () => {
  try { pmd.valueOf(); throw new Error('should have thrown'); }
  catch(e) { if(e.message === 'should have thrown') throw e; }
});

// --- Temporal.ZonedDateTime ---
const zdt = Temporal.ZonedDateTime.from('2024-01-15T12:30:45+00:00[UTC]');
test('ZonedDateTime constructor', () => { new Temporal.ZonedDateTime(0n, 'UTC'); });
test('ZonedDateTime.from', () => { Temporal.ZonedDateTime.from('2024-01-15T12:30:45+00:00[UTC]'); });
test('ZonedDateTime.compare', () => { Temporal.ZonedDateTime.compare(zdt, zdt); });
test('ZonedDateTime.year', () => { zdt.year; });
test('ZonedDateTime.month', () => { zdt.month; });
test('ZonedDateTime.day', () => { zdt.day; });
test('ZonedDateTime.hour', () => { zdt.hour; });
test('ZonedDateTime.minute', () => { zdt.minute; });
test('ZonedDateTime.second', () => { zdt.second; });
test('ZonedDateTime.millisecond', () => { zdt.millisecond; });
test('ZonedDateTime.microsecond', () => { zdt.microsecond; });
test('ZonedDateTime.nanosecond', () => { zdt.nanosecond; });
test('ZonedDateTime.epochMilliseconds', () => { zdt.epochMilliseconds; });
test('ZonedDateTime.epochNanoseconds', () => { zdt.epochNanoseconds; });
test('ZonedDateTime.calendarId', () => { zdt.calendarId; });
test('ZonedDateTime.timeZoneId', () => { zdt.timeZoneId; });
test('ZonedDateTime.offset', () => { zdt.offset; });
test('ZonedDateTime.offsetNanoseconds', () => { zdt.offsetNanoseconds; });
test('ZonedDateTime.dayOfWeek', () => { zdt.dayOfWeek; });
test('ZonedDateTime.dayOfYear', () => { zdt.dayOfYear; });
test('ZonedDateTime.weekOfYear', () => { zdt.weekOfYear; });
test('ZonedDateTime.yearOfWeek', () => { zdt.yearOfWeek; });
test('ZonedDateTime.daysInWeek', () => { zdt.daysInWeek; });
test('ZonedDateTime.daysInMonth', () => { zdt.daysInMonth; });
test('ZonedDateTime.daysInYear', () => { zdt.daysInYear; });
test('ZonedDateTime.monthsInYear', () => { zdt.monthsInYear; });
test('ZonedDateTime.inLeapYear', () => { zdt.inLeapYear; });
test('ZonedDateTime.hoursInDay', () => { zdt.hoursInDay; });
test('ZonedDateTime.era', () => { zdt.era; });
test('ZonedDateTime.eraYear', () => { zdt.eraYear; });
test('ZonedDateTime.monthCode', () => { zdt.monthCode; });
test('ZonedDateTime.equals', () => { zdt.equals(zdt); });
test('ZonedDateTime.add', () => { zdt.add({ hours: 1 }); });
test('ZonedDateTime.subtract', () => { zdt.subtract({ hours: 1 }); });
test('ZonedDateTime.with', () => { zdt.with({ hour: 9 }); });
test('ZonedDateTime.withCalendar', () => { zdt.withCalendar('iso8601'); });
test('ZonedDateTime.withPlainTime', () => { zdt.withPlainTime({ hour: 9 }); });
test('ZonedDateTime.withTimeZone', () => { zdt.withTimeZone('America/New_York'); });
test('ZonedDateTime.until', () => { zdt.until(zdt); });
test('ZonedDateTime.since', () => { zdt.since(zdt); });
test('ZonedDateTime.round', () => { zdt.round({ smallestUnit: 'minute' }); });
test('ZonedDateTime.startOfDay', () => { zdt.startOfDay(); });
test('ZonedDateTime.getTimeZoneTransition', () => { zdt.getTimeZoneTransition('next'); });
test('ZonedDateTime.toInstant', () => { zdt.toInstant(); });
test('ZonedDateTime.toPlainDate', () => { zdt.toPlainDate(); });
test('ZonedDateTime.toPlainTime', () => { zdt.toPlainTime(); });
test('ZonedDateTime.toPlainDateTime', () => { zdt.toPlainDateTime(); });
test('ZonedDateTime.toString', () => { zdt.toString(); });
test('ZonedDateTime.toJSON', () => { zdt.toJSON(); });
test('ZonedDateTime.toLocaleString', () => { zdt.toLocaleString(); });
test('ZonedDateTime.valueOf throws', () => {
  try { zdt.valueOf(); throw new Error('should have thrown'); }
  catch(e) { if(e.message === 'should have thrown') throw e; }
});

}

try {
  main();
} catch(e) {
  // If Temporal doesn't exist at all (Node 14/16), even top-level
  // references like `new Temporal.Duration(...)` will throw.
  results.fail.push({ name: 'Temporal global', error: e.message });
}

// --- Report ---
const total = results.pass.length + results.fail.length;
console.log(`PASS_COUNT: ${results.pass.length}`);
console.log(`Results: ${results.pass.length}/${total} passed\n`);
if (results.fail.length) {
  console.log('FAILED:');
  results.fail.forEach(f => console.log(`  ${f.name}: ${f.error}`));
} else {
  console.log('All tests passed!');
}

// Always exit 0 — this is a probe, not an assertion. The CI reads PASS_COUNT.
process.exit(0);
