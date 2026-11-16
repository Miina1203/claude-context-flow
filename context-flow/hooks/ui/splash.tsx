// 起動アニメーション。
// セッションが始まってから少しの間、タイトルが打ち出され、線が中央から開き、
// 波が立ってから、画面が上から下へ開く。
// ときどき(RARE_ODDS 回に 1 回)、金色の文字と星空に流れ星が走る、まれな起動になる。
import type { EngineInterface, RenderInput } from 'claude-code'

import {
  BARS,
  backgroundAt,
  gold,
  hueAt,
  isRareBoot,
  shootingStar,
  starRow,
  ultra,
} from '../domain/color'
import { flags } from '../store'

type PaneInput = Extract<RenderInput, { component: 'Pane' }>

/** タイトルが出ている時間と、そのあと画面が開く時間。 */
const SPLASH_MS = 1900
const REVEAL_MS = 700
const WORDMARK = 'c o n t e x t   f l o w'
/** まれな起動の、金色のひとこと。 */
const RARE_GOLD = '#ffd54a'
/** まれな起動の、星の色。 */
const STAR_COLOR = '#8f9bd6'

const clamp = (v: number): number => Math.min(1, Math.max(0, v))

/**
 * 起動からの時間に応じて、タイトルの画面・開きかけのペイン・ペインそのものを返す。
 * `sinceBoot` は起動アニメーションが始まってからのミリ秒、`view` は描き上がったペイン。
 * `bootAt` は起動の時刻(まれな起動かどうかと、星の位置を決める)。
 */
export function renderBoot(
  $: EngineInterface,
  e: PaneInput,
  view: JSX.Element,
  at: { sinceBoot: number; bootAt: number; frame: number; columns: number; room: number },
): JSX.Element {
  const { Box, Text } = $.ui.resolve(e)
  const { sinceBoot, bootAt, frame, columns, room } = at
  if (sinceBoot >= SPLASH_MS + REVEAL_MS) return view
  if (sinceBoot >= SPLASH_MS) {
    const k = (sinceBoot - SPLASH_MS) / REVEAL_MS
    const eased = 1 - (1 - k) * (1 - k) * (1 - k)

    return (
      <Box
        flexDirection="column"
        height={Math.max(1, Math.round(room * eased))}
        overflow="hidden"
      >
        {view}
      </Box>
    )
  }

  const isRare = isRareBoot(bootAt)
  const paint = isRare ? gold : ultra
  const typed = [...WORDMARK].slice(0, Math.floor(sinceBoot / 40)).join('')
  const isTyping = typed.length < WORDMARK.length
  const opened = clamp((sinceBoot - 150) / 800)
  const half = Math.round((1 - (1 - opened) * (1 - opened)) * (columns / 2))
  // 波の高さは、立ち上がってから静まる。まれな起動では、波の代わりに流れ星が横切る。
  const swell = Math.sin(Math.PI * clamp((sinceBoot - 350) / 1450))
  const crest = isRare
    ? shootingStar(clamp((sinceBoot - 350) / 1300), columns)
    : Array.from({ length: columns }, (_, c) => {
        const level = swell * ((Math.sin(frame * 1.3 + c * 0.42) + 1) / 2)

        return BARS[Math.round(level * (BARS.length - 1))] ?? '▁'
      }).join('')
  const status = isRare
    ? sinceBoot < 1250
      ? '✦ 流れ星 ✦'
      : '✦ 今日はいい流れになりそう ✦'
    : sinceBoot < 1250
      ? '会話の流れを読み込み中'
      : '準備完了'

  // タイトル・線・波・ひとことを、縦の中央に 1 行おきに置く。
  // 背景はペインと同じく、行ごとに塗る。
  const top = Math.max(1, Math.floor((room - 7) / 2))
  const splash = new Map<number, JSX.Element>([
    [
      top,
      <Box flexDirection="row">
        {paint(typed === '' ? ' ' : typed, frame).map(run => (
          <Text bold color={run.color}>
            {run.text}
          </Text>
        ))}
        {isTyping && <Text color={isRare ? RARE_GOLD : hueAt(frame)}>▍</Text>}
      </Box>,
    ],
    [
      top + 2,
      <Box flexDirection="row">
        {paint('━'.repeat(Math.max(1, half * 2)), frame).map(run => (
          <Text bold color={run.color}>
            {run.text}
          </Text>
        ))}
      </Box>,
    ],
    [
      top + 4,
      <Box flexDirection="row">
        {paint(crest, frame).map(run => (
          <Text color={run.color}>{run.text}</Text>
        ))}
      </Box>,
    ],
    [
      top + 6,
      <Box flexDirection="row">
        {isRare ? <Text color={RARE_GOLD}>{status}</Text> : <Text dimColor>{status}</Text>}
      </Box>,
    ],
  ])
  // まれな起動では、空いた行に星を散らす。
  const sky = (row: number): JSX.Element | undefined =>
    isRare ? (
      <Text color={STAR_COLOR}>
        {starRow(bootAt, row, columns, frame).replace(/ /g, ' ')}
      </Text>
    ) : undefined

  return (
    <Box flexDirection="column">
      {Array.from({ length: room }, (_, i) => (
        <Box
          flexDirection="column"
          alignItems="center"
          width={e.props.bodyColumns}
          paddingX={2}
          backgroundColor={backgroundAt(flags.paletteName, i, room)}
        >
          {splash.get(i) ?? sky(i) ?? <Text> </Text>}
        </Box>
      ))}
    </Box>
  )
}
