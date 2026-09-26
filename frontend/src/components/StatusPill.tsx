import type { ReactNode } from 'react'

export type PillTone = 'grey' | 'blue' | 'amber' | 'green' | 'dim'

const toneClasses: Record<PillTone, string> = {
  grey: 'bg-gray-100 text-gray-600',
  blue: 'bg-blue-50 text-blue-700',
  amber: 'bg-amber-50 text-amber-800',
  green: 'bg-emerald-50 text-emerald-700',
  dim: 'bg-gray-50 text-gray-400',
}

export function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap ${toneClasses[tone]}`}
    >
      {children}
    </span>
  )
}
