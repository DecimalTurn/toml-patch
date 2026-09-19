/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

// Vendored from smol-toml (https://github.com/squirrelchat/smol-toml),
// src/date.ts. Kept in the regular package so values produced by smol-toml's
// parser can be recognised by type. The lite distribution duck-types these
// values instead of importing this module, to stay small.

import { LocalDate, LocalTime, LocalDateTime, OffsetDateTime } from './date-format';

type Offset = string | null

const DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[T ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|[-+]\d{2}:\d{2})?$/i

export class TomlDate extends Date {
	#hasDate = false
	#hasTime = false
	#offset: Offset = null

	constructor(date: string | Date) {
		let hasDate = true
		let hasTime = true
		let offset: Offset = 'Z'

		if (typeof date === 'string') {
			const match = date.match(DATE_TIME_RE)
			if (match) {
				if (!match[1]) {
					hasDate = false
					date = `0000-01-01T${date}`
				}

				hasTime = !!match[2]
				// Make sure to use T instead of a space. Breaks in case of extreme values otherwise.
				if (hasTime && date[10] === ' ') {
					date = date.replace(' ', 'T')
				}
				// Do not allow rollover hours.
				if (match[2] && +match[2] > 23) {
					date = ''
				} else {
					offset = match[3] || null
					date = date.toUpperCase()
					if (!offset && hasTime) date += 'Z'
				}
			} else {
				date = ''
			}
		}

		super(date)
		if (!isNaN(this.getTime())) {
			this.#hasDate = hasDate
			this.#hasTime = hasTime
			this.#offset = offset
		}
	}

	isDateTime() {
		return this.#hasDate && this.#hasTime
	}

	isLocal() {
		return !this.#hasDate || !this.#hasTime || !this.#offset
	}

	isDate() {
		return this.#hasDate && !this.#hasTime
	}

	isTime() {
		return this.#hasTime && !this.#hasDate
	}

	isValid() {
		return this.#hasDate || this.#hasTime
	}

	override toISOString() {
		const iso = super.toISOString()

		// Local Date
		if (this.isDate())
			return iso.slice(0, 10)

		// Local Time
		if (this.isTime())
			return iso.slice(11, 23)

		// Local DateTime
		if (this.#offset === null)
			return iso.slice(0, -1)

		// Offset DateTime
		if (this.#offset === 'Z')
			return iso

		// This part is quite annoying: JS strips the original timezone from the ISO string representation
		// Instead of using a "modified" date and "Z", we restore the representation "as authored"

		let offset = (+(this.#offset.slice(1, 3)) * 60) + +(this.#offset.slice(4, 6))
		offset = this.#offset[0] === '-' ? offset : -offset

		const offsetDate = new Date(this.getTime() - (offset * 60e3))
		return offsetDate.toISOString().slice(0, -1) + this.#offset
	}

	static wrapAsOffsetDateTime(jsDate: Date, offset = 'Z') {
		const date = new TomlDate(jsDate)
		date.#offset = offset
		return date
	}

	static wrapAsLocalDateTime(jsDate: Date) {
		const date = new TomlDate(jsDate)
		date.#offset = null
		return date
	}

	static wrapAsLocalDate(jsDate: Date) {
		const date = new TomlDate(jsDate)
		date.#hasTime = false
		date.#offset = null
		return date
	}

	static wrapAsLocalTime(jsDate: Date) {
		const date = new TomlDate(jsDate)
		date.#hasDate = false
		date.#offset = null
		return date
	}
}

/**
 * True when `value` is a smol-toml `TomlDate` instance.
 *
 * Duck-typed rather than `instanceof TomlDate`: the caller's object was parsed
 * by the smol-toml package, whose `TomlDate` is a different class object than
 * this vendored copy, so `instanceof` would never match. The `isDate` /
 * `isTime` / `isDateTime` methods only exist on smol-toml's date class, which
 * is what distinguishes it from toml-patch's own date classes.
 */
export function isSmolTomlDate(value: unknown): value is TomlDate {
  return (
    value instanceof Date &&
    typeof (value as any).isDate === 'function' &&
    typeof (value as any).isTime === 'function' &&
    typeof (value as any).isDateTime === 'function'
  );
}

/**
 * Converts a smol-toml `TomlDate` into the equivalent toml-patch date class.
 *
 * smol-toml always renders a zero-fraction time or datetime with a trailing
 * `.000`, while toml-patch omits it. Stripping it gives the canonical form
 * that compares equal to a value parsed from TOML source without a fraction.
 */
export function smolTomlDateToNative(
  value: TomlDate
): LocalDate | LocalTime | LocalDateTime | OffsetDateTime {
  const canonical = value.toISOString().replace(/\.000(?=([Zz]|[+-]\d{2}:\d{2})$|$)/, '');

  if (value.isDate()) {
    return new LocalDate(canonical);
  }
  if (value.isTime()) {
    return new LocalTime(canonical, canonical);
  }
  if (value.isLocal()) {
    return new LocalDateTime(canonical, false);
  }
  return new OffsetDateTime(canonical, false);
}
