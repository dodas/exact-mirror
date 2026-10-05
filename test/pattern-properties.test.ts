import { Type as t } from 'typebox'

import { describe, it, expect } from 'bun:test'
import { isEqual, isEqualToTypeBox } from './utils'
import { createMirror } from '../src'

const custom = { '^custom[A-Z]': t.Any() }

describe('patternProperties on Object', () => {
	it('keeps extra keys a pattern matches and drops the rest', () => {
		const shape = t.Object(
			{ id: t.String(), name: t.String() },
			{ patternProperties: custom }
		)

		isEqual(
			shape,
			{
				id: '1',
				name: 'Ann',
				// @ts-expect-error
				customColor: 'Red',
				'customEst Equity $': 1,
				rating: 5,
				credentialId: 'c',
				custom1st: 'x'
			},
			{
				id: '1',
				name: 'Ann',
				customColor: 'Red',
				'customEst Equity $': 1
			}
		)
	})

	it('treats additionalProperties: false the same as absent', () => {
		const shape = t.Object(
			{ id: t.String() },
			{ patternProperties: custom, additionalProperties: false }
		)

		isEqual(
			shape,
			// @ts-expect-error
			{ id: '1', customA: 1, other: 2 },
			{ id: '1', customA: 1 }
		)
	})

	it('keeps every key when additionalProperties is true', () => {
		const shape = t.Object(
			{ id: t.String() },
			{ patternProperties: custom, additionalProperties: true }
		)

		// @ts-expect-error
		isEqual(shape, { id: '1', customA: 1, other: 2 })
	})

	it('does not override a declared optional key', () => {
		const shape = t.Object(
			{ id: t.String(), opt: t.Optional(t.String()) },
			{ patternProperties: custom }
		)

		isEqual(
			shape,
			// @ts-expect-error
			{ id: '1', customX: 1, zzz: 2 },
			{ id: '1', customX: 1 }
		)
		isEqual(
			shape,
			// @ts-expect-error
			{ id: '1', opt: 'o', customX: 1 },
			{ id: '1', opt: 'o', customX: 1 }
		)
	})

	it('applies each pattern with its own schema', () => {
		const shape = t.Object(
			{ id: t.String() },
			{
				patternProperties: {
					...custom,
					'^x_': t.Object({ a: t.Number() })
				}
			}
		)

		isEqual(
			shape,
			// @ts-expect-error
			{ id: '1', customA: 1, x_b: { a: 2, junk: 3 }, other: 4 },
			{ id: '1', customA: 1, x_b: { a: 2 } }
		)
	})

	it('works inside arrays', () => {
		const shape = t.Array(
			t.Object({ id: t.String() }, { patternProperties: custom })
		)

		isEqual(
			shape,
			[
				// @ts-expect-error
				{ id: '1', customA: 1, drop: 1 },
				// @ts-expect-error
				{ id: '2', customB: 2 }
			],
			[
				{ id: '1', customA: 1 },
				{ id: '2', customB: 2 }
			]
		)
	})

	it('works in nested objects', () => {
		const shape = t.Object({
			meta: t.Object({ k: t.String() }, { patternProperties: custom })
		})

		isEqual(
			shape,
			// @ts-expect-error
			{ meta: { k: 'v', customZ: 9, drop: 1 }, drop: 1 },
			{ meta: { k: 'v', customZ: 9 } }
		)
	})

	it('works in union members', () => {
		const shape = t.Union([
			t.Object(
				{ kind: t.Literal('a'), id: t.String() },
				{ patternProperties: custom }
			),
			t.Object({ kind: t.Literal('b') })
		])

		isEqual(
			shape,
			// @ts-expect-error
			{ kind: 'a', id: '1', customQ: 1, drop: 1 },
			{ kind: 'a', id: '1', customQ: 1 }
		)
	})

	it('drops the optional fields a matched value leaves out', () => {
		const shape = t.Object(
			{ id: t.String() },
			{
				patternProperties: {
					'^custom[A-Z]': t.Object({
						a: t.Number(),
						b: t.Optional(t.String()),
						list: t.Array(
							t.Object({
								x: t.Number(),
								y: t.Optional(t.Number())
							})
						)
					})
				}
			}
		)

		isEqual(
			shape,
			{
				id: '1',
				// @ts-expect-error
				customA: { a: 1, junk: 1, list: [{ x: 1, junk: 1 }] },
				customB: { a: 2, b: 'b', list: [] }
			},
			{
				id: '1',
				customA: { a: 1, list: [{ x: 1 }] },
				customB: { a: 2, b: 'b', list: [] }
			}
		)
	})

	it('compiles each pattern once and hoists it into the source', () => {
		const shape = t.Object(
			{
				a: t.Object({ id: t.String() }, { patternProperties: custom }),
				b: t.Object({ id: t.String() }, { patternProperties: custom })
			},
			{ patternProperties: custom }
		)

		const { source } = createMirror(shape, { emit: true })

		expect(source.match(/new RegExp\(/g)?.length).toBe(1)
		expect(source.startsWith('const pp0=new RegExp("^custom[A-Z]")')).toBe(
			true
		)
	})

	it('does not let a pattern key hijack the output prototype', () => {
		const shape = t.Object(
			{ id: t.String() },
			{ patternProperties: { '^__': t.Any() } }
		)

		const clean = createMirror(shape)
		const hostile = JSON.parse(
			'{"id":"1","__proto__":{"constructor":{"name":"Hijacked"}}}'
		)
		const value = clean(hostile) as any

		expect(Object.getPrototypeOf(value)).toBe(Object.prototype)
		expect(value.constructor.name).toBe('Object')
	})
})

describe('patternProperties on Record', () => {
	it('drops keys that do not match a regex key', () => {
		const shape = t.Record(t.String({ pattern: '^custom[A-Z]' }), t.Any())

		isEqual(shape, { random: true, customProp: true }, { customProp: true })
		isEqualToTypeBox(shape, { random: true, customProp: true })
	})

	it('mirrors matching values through the value schema', () => {
		const shape = t.Record(
			t.String({ pattern: '^custom[A-Z]' }),
			t.Object({ a: t.Number() })
		)

		isEqual(
			shape,
			// @ts-expect-error
			{ customA: { a: 1, junk: 2 }, nope: { a: 3 } },
			{ customA: { a: 1 } }
		)
	})

	it('drops the optional fields a matched value leaves out', () => {
		const shape = t.Record(
			t.String({ pattern: '^custom[A-Z]' }),
			t.Object({ a: t.Number(), b: t.Optional(t.String()) })
		)

		isEqual(
			shape,
			// @ts-expect-error
			{
				customA: { a: 1, junk: 1 },
				customB: { a: 2, b: 'b' },
				nope: { a: 3 }
			},
			{ customA: { a: 1 }, customB: { a: 2, b: 'b' } }
		)
	})

	it('keeps non-matching keys when additionalProperties is true', () => {
		const shape = t.Record(t.String({ pattern: '^custom[A-Z]' }), t.Any(), {
			additionalProperties: true
		})

		isEqual(shape, { random: true, customProp: true })
	})

	it('still takes the wildcard fast path for Record(String, T)', () => {
		const shape = t.Record(t.String(), t.Object({ a: t.Number() }))

		expect(createMirror(shape, { emit: true }).source).not.toContain(
			'new RegExp'
		)
		isEqual(
			shape,
			// @ts-expect-error
			{ x: { a: 1, junk: 2 }, y: { a: 3 } },
			{ x: { a: 1 }, y: { a: 3 } }
		)
	})
})
