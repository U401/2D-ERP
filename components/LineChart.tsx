'use client'

import { useMemo } from 'react'

export type LinePoint = {
  label: string
  value: number
}

type Props = {
  points: LinePoint[]
  height?: number
  /** Show only every Nth label (still plots all points). 1 = show all labels. */
  labelEvery?: number
  /** Minimum width in pixels for the chart area (enables horizontal scroll upstream). */
  minWidthPx?: number
}

export default function LineChart({
  points,
  height = 220,
  labelEvery = 1,
  minWidthPx,
}: Props) {
  const { pathD, yMin, yMax, svgWidth } = useMemo(() => {
    const padding = { top: 14, right: 16, bottom: 34, left: 44 }

    const safePoints = points.length > 0 ? points : [{ label: '', value: 0 }]
    const values = safePoints.map((p) => (Number.isFinite(p.value) ? p.value : 0))
    const min = Math.min(...values, 0)
    const max = Math.max(...values, 1)

    // Keep charts readable on desktop without forcing horizontal scroll for common ranges (e.g. 24 points).
    const w = Math.max(minWidthPx ?? 0, safePoints.length * 40, 320)
    const h = height

    const innerW = w - padding.left - padding.right
    const innerH = h - padding.top - padding.bottom

    const scaleX = (i: number) => {
      if (safePoints.length === 1) return padding.left + innerW / 2
      return padding.left + (i / (safePoints.length - 1)) * innerW
    }

    const scaleY = (v: number) => {
      const denom = max - min || 1
      const t = (v - min) / denom
      return padding.top + (1 - t) * innerH
    }

    const d = safePoints
      .map((p, i) => {
        const x = scaleX(i)
        const y = scaleY(p.value)
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')

    return { pathD: d, yMin: min, yMax: max, svgWidth: w }
  }, [height, minWidthPx, points])

  if (points.length === 0) {
    return (
      <div className="h-[220px] flex items-center justify-center text-slate-500 text-sm">
        No data
      </div>
    )
  }

  const padding = { top: 14, right: 16, bottom: 34, left: 44 }
  const innerH = height - padding.top - padding.bottom

  const formatMoney = (n: number) => `₱${n.toFixed(2)}`

  const yTickTop = yMax
  const yTickMid = (yMin + yMax) / 2
  const yTickBot = yMin

  return (
    <svg
      width={svgWidth}
      height={height}
      viewBox={`0 0 ${svgWidth} ${height}`}
      className="block"
      role="img"
      aria-label="Line chart"
    >
      {/* Grid / axis */}
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={padding.top + innerH}
        stroke="#e5e7eb"
      />
      <line
        x1={padding.left}
        y1={padding.top + innerH}
        x2={svgWidth - padding.right}
        y2={padding.top + innerH}
        stroke="#e5e7eb"
      />

      {/* Y labels */}
      {[yTickTop, yTickMid, yTickBot].map((v, idx) => {
        const denom = (yMax - yMin) || 1
        const t = (v - yMin) / denom
        const y = padding.top + (1 - t) * innerH
        return (
          <g key={idx}>
            <line
              x1={padding.left}
              y1={y}
              x2={svgWidth - padding.right}
              y2={y}
              stroke="#f1f5f9"
            />
            <text
              x={padding.left - 8}
              y={y + 4}
              textAnchor="end"
              fontSize="11"
              fill="#64748b"
            >
              {formatMoney(v)}
            </text>
          </g>
        )
      })}

      {/* Line */}
      <path d={pathD} fill="none" stroke="#0f172a" strokeWidth="2.5" />

      {/* Points + X labels */}
      {points.map((p, i) => {
        const x =
          points.length === 1
            ? padding.left + (svgWidth - padding.left - padding.right) / 2
            : padding.left + (i / (points.length - 1)) * (svgWidth - padding.left - padding.right)

        const denom = (yMax - yMin) || 1
        const t = (p.value - yMin) / denom
        const y = padding.top + (1 - t) * innerH

        const showLabel =
          labelEvery <= 1 ||
          i === 0 ||
          i === points.length - 1 ||
          i % labelEvery === 0

        return (
          <g key={`${p.label}-${i}`}>
            <circle cx={x} cy={y} r={3} fill="#0f172a">
              <title>{`${p.label}: ${formatMoney(p.value)}`}</title>
            </circle>

            {showLabel && (
              <text
                x={x}
                y={height - 10}
                textAnchor="middle"
                fontSize="11"
                fill="#64748b"
              >
                {p.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}




