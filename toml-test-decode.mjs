#!/usr/bin/env node
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

// Script for https://github.com/toml-lang/toml-test

import { parse, LocalDate, LocalTime, LocalDateTime, OffsetDateTime } from './dist/toml-patch.js'

function tagObject (obj) {
	if (typeof obj === 'string') {
		return { type: 'string', value: obj }
	}

	if (typeof obj === 'boolean') {
		return { type: 'bool', value: obj.toString() }
	}

	if (typeof obj === 'number') {
		if (isNaN(obj)) return { type: 'float', value: 'nan' }
		if (obj === Infinity) return { type: 'float', value: 'inf' }
		if (obj === -Infinity) return { type: 'float', value: '-inf' }
		if (Object.is(obj, -0)) return { type: 'float', value: '-0.0' }
		return { type: 'float', value: obj.toString() }
	}

	if (typeof obj === 'bigint') {
		return { type: 'integer', value: obj.toString() }
	}

	if (obj instanceof OffsetDateTime) {
		return { type: 'datetime', value: obj.toISOString().replace(' ', 'T') }
	}

	if (obj instanceof LocalDateTime) {
		return { type: 'datetime-local', value: obj.toISOString().replace(' ', 'T') }
	}

	if (obj instanceof LocalDate) {
		return { type: 'date-local', value: obj.toISOString() }
	}

	if (obj instanceof LocalTime) {
		return { type: 'time-local', value: obj.toISOString() }
	}

	if (obj instanceof Date) {
		return { type: 'datetime', value: obj.toISOString() }
	}

	if (Array.isArray(obj)) {
		return obj.map((e) => tagObject(e))
	}

	let tagged = {}
	for (const k in obj) tagged[k] = tagObject(obj[k])
	return tagged
}

const chunks = []
process.stdin.on('data', (chunk) => chunks.push(chunk))
process.stdin.on('end', () => {
	const bytes = Buffer.concat(chunks)
	const parsed = parse(bytes, { integersAsBigInt: true })
	const tagged = tagObject(parsed)
	console.log(JSON.stringify(tagged, null ,2))
})
