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

import { TomlDocument, LocalDate, LocalTime, LocalDateTime, OffsetDateTime } from './dist/toml-patch.js'

function blank () {
	return {}
}

function last (arr) {
	return arr[arr.length - 1]
}

function ensure (object, keys) {
	return keys.reduce((active, subkey) => {
		if (!active[subkey]) active[subkey] = blank()
		return Array.isArray(active[subkey]) ? last(active[subkey]) : active[subkey]
	}, object)
}

function ensureTable (object, key) {
	const target = ensure(object, key.slice(0, -1))
	const lastKey = last(key)
	if (!target[lastKey]) target[lastKey] = blank()
	return target[lastKey]
}

function ensureTableArray (object, key) {
	const target = ensure(object, key.slice(0, -1))
	const lastKey = last(key)
	if (!target[lastKey]) target[lastKey] = []
	const next = blank()
	target[lastKey].push(next)
	return next
}

function tagDate (obj) {
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

	throw new Error('Unrecognized date node value')
}

function tagFloatValue (value) {
	if (Number.isNaN(value)) return { type: 'float', value: 'nan' }
	if (value === Infinity) return { type: 'float', value: 'inf' }
	if (value === -Infinity) return { type: 'float', value: '-inf' }
	if (Object.is(value, -0)) return { type: 'float', value: '-0.0' }

	let raw = value.toString()
	if (!/[.eE]/.test(raw)) raw += '.0'
	return { type: 'float', value: raw }
}

function integerStringFromRaw (raw) {
	const compact = raw.replace(/_/g, '')
	let normalized = compact

	if (/^[+-]?0x/i.test(compact) || /^[+-]?0o/i.test(compact) || /^[+-]?0b/i.test(compact)) {
		const sign = compact[0] === '+' || compact[0] === '-' ? compact[0] : ''
		const body = compact.slice(sign ? 1 : 0)
		normalized = sign + body.toLowerCase()
	}

	return BigInt(normalized).toString()
}

function setDottedKey (target, key, value) {
	const container = key.length > 1 ? ensureTable(target, key.slice(0, -1)) : target
	container[last(key)] = value
}

function tagAstValue (node) {
	switch (node.type) {
		case 'String':
			return { type: 'string', value: node.value }

		case 'Integer':
			return { type: 'integer', value: integerStringFromRaw(node.raw) }

		case 'Float':
			return tagFloatValue(node.value)

		case 'Boolean':
			return { type: 'bool', value: node.value.toString() }

		case 'DateTime':
			return tagDate(node.value)

		case 'InlineArray':
			return node.items.map((item) => tagAstValue(item.item))

		case 'InlineTable': {
			const tagged = {}
			for (const { item } of node.items) {
				setDottedKey(tagged, item.key.value, tagAstValue(item.value))
			}
			return tagged
		}

		default:
			throw new Error(`Unrecognized value type: ${node.type}`)
	}
}

function tagDocument (ast) {
	const tagged = {}
	let active = tagged

	for (const block of ast) {
		switch (block.type) {
			case 'Table':
				active = ensureTable(tagged, block.key.item.value)
				for (const item of block.items) {
					if (item.type === 'KeyValue') {
						setDottedKey(active, item.key.value, tagAstValue(item.value))
					}
				}
				break

			case 'TableArray':
				active = ensureTableArray(tagged, block.key.item.value)
				for (const item of block.items) {
					if (item.type === 'KeyValue') {
						setDottedKey(active, item.key.value, tagAstValue(item.value))
					}
				}
				break

			case 'KeyValue':
				setDottedKey(active, block.key.value, tagAstValue(block.value))
				break

			default:
				break
		}
	}

	return tagged
}

const chunks = []
process.stdin.on('data', (chunk) => chunks.push(chunk))
process.stdin.on('end', () => {
	const bytes = Buffer.concat(chunks)
	const document = new TomlDocument(bytes)

	// Trigger semantic validation from the already parsed AST.
	// This preserves invalid-fixture behavior without a second parse pass.
	document.toJsObject

	const tagged = tagDocument(document.ast)
	console.log(JSON.stringify(tagged, null ,2))
})
