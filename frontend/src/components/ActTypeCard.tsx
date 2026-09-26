import type { ReactNode } from 'react'

interface ActTypeCardProps {
  name: string
  descriptor: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
}

export function ActTypeCard({ name, descriptor, icon, onClick, disabled }: ActTypeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-4 rounded-[10px] border border-gray-200 bg-white p-[22px] text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/40 disabled:opacity-50"
    >
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
        {icon}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-base font-bold text-gray-900">{name}</span>
        <span className="text-[13px] text-gray-500">{descriptor}</span>
      </div>
    </button>
  )
}
