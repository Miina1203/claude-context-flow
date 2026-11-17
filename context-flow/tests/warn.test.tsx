// コンテキストが 80% を超えた時の警報(計器の演出・警告の行。トーストは出さない)。
import { expect, mock, test } from 'claude-code/testing'

import { INTRO_MS, WARN_MESSAGE, WARN_PERCENT, alarmAt, alarmBar, alarmLine, blinkOn, crossedWarn, isOverWarn, urgency } from '../hooks/domain/alarm'
import { cells } from '../hooks/domain/text'

const textOf = (runs: { text: string }[]) => runs.map(run => run.text).join('').replace(/ /g, ' ')

const PANE = {
  plugin: 'context-flow',
  component: 'Pane',
  requestId: 'context-flow',
  props: {
    title: 'context',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('警報の境目は 80%:未満は出さず、以上で出す', async () => {
  expect(WARN_PERCENT).toBe(80)
  expect(isOverWarn(undefined)).toBe(false)
  expect(isOverWarn(79.9)).toBe(false)
  expect(isOverWarn(80)).toBe(true)
  // 下から越えた時だけ知らせる(越えたまま・下がった時は知らせない)。
  expect(crossedWarn(70, 81)).toBe(true)
  expect(crossedWarn(undefined, 90)).toBe(true)
  expect(crossedWarn(81, 85)).toBe(false)
  expect(crossedWarn(85, 60)).toBe(false)
})

test('警報の色はコマごとに変わり、点滅は点いて消える', async () => {
  expect(alarmAt(0)).toMatch(/^#[0-9a-f]{6}$/)
  expect(alarmAt(0)).not.toBe(alarmAt(3))
  // 同じコマでも、マスごとに位相がずれて波になる。
  expect(alarmAt(0, 0)).not.toBe(alarmAt(0, 4))
  expect(blinkOn(0)).toBe(true)
  expect(blinkOn(3)).toBe(false)
  expect(blinkOn(6)).toBe(true)
})

test('計器の線:幅ちょうどで、先端に火花、空きは注意テープ。登場の瞬きは最初だけ', async () => {
  const bar = alarmBar(30, 44, 5, Infinity, 85)
  const text = textOf(bar)
  expect([...text].length).toBe(44)
  expect([...text][29]).toMatch(/[✦✶✧]/)
  expect(text.slice(30)).toBe('╱'.repeat(14))
  // 登場の最初の 0.1 秒は線全体が白い。
  const flash = alarmBar(30, 44, 0, 50, 85)
  expect(flash[0]?.color).not.toBe(alarmBar(30, 44, 0, Infinity, 85)[0]?.color)
})

test('警告の行:打ち出しの途中は乱れた字、打ち終えると文と ››› が揃う', async () => {
  const typing = alarmLine(0, 200, 85, 60)
  expect(textOf(typing.left).length).toBeLessThan(20)
  expect(typing.right).toEqual([])
  const done = alarmLine(0, INTRO_MS, 85, 60)
  expect(textOf(done.left)).toBe(`⚠  WARNING  ${WARN_MESSAGE}`)
  expect(textOf(done.right)).toBe('››› /compact')
  // 狭いと /compact を省き、幅に収める。
  const narrow = alarmLine(0, INTRO_MS, 85, 44)
  expect(cells(textOf(narrow.left)) + cells(textOf(narrow.right))).toBeLessThanOrEqual(44)
  // 90% 以上は CRITICAL、近いほど速い。
  expect(textOf(alarmLine(0, INTRO_MS, 92, 60).left)).toContain('CRITICAL')
  expect(urgency(80)).toBe(1)
  expect(urgency(100)).toBe(2)
})

const meterAt = (percent: number) => ({
  value: {
    context: { tokens: percent * 2000, window: 200000, percent },
  },
})

test('80% を超えると計器が警報になり、トーストは出さない', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  on('tool.call', () => ({ result: {} }))
  // 計器はツール呼び出しのたびに読み直される。
  const refresh = async () => {
    await $.tool.call({ tool: 'Bash', command: 'ls', description: '一覧を見る' })
    await clock.settle()
  }
  let percent = 50
  const toasts: string[] = []
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => meterAt(percent))
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text?: unknown }).text ?? e))

    return { value: undefined }
  })

  await refresh()
  const calm = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await calm.find({ type: 'Text', text: /╱/ })).toBeUndefined()
  await calm.unmount()
  expect(toasts).toEqual([])

  percent = 85
  await refresh()
  const warned = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // 越えた直後は打ち出しの途中なので、計器の注意テープで警報を確かめる。
  expect(await warned.find({ type: 'Text', text: /╱/ })).toBeDefined()
  await warned.unmount()
  expect(toasts).toEqual([])
})
