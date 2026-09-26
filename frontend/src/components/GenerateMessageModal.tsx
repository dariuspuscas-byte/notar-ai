import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CopyIcon, XIcon } from './icons'

interface GenerateMessageModalProps {
  initialText: string
  onClose: () => void
}

/** Parent only mounts this while the modal should be open (see CaseViewPage),
 * so state can initialize straight from props — no reset effect needed. */
export function GenerateMessageModal({ initialText, onClose }: GenerateMessageModalProps) {
  const { t } = useTranslation()
  const [text, setText] = useState(initialText)
  const [copied, setCopied] = useState(false)

  const waLink = `https://wa.me/?text=${encodeURIComponent(text)}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col gap-4 rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{t('generateMessage.title')}</h2>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="w-full resize-none rounded-lg border border-gray-300 p-3 text-sm text-gray-800 focus:border-blue-500 focus:outline-none"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center justify-center rounded-md border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {t('generateMessage.sendWhatsApp')}
          </a>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(text)
              setCopied(true)
            }}
            className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800"
          >
            <CopyIcon className="h-4 w-4" />
            {copied ? t('generateMessage.copied') : t('generateMessage.copy')}
          </button>
        </div>
      </div>
    </div>
  )
}
