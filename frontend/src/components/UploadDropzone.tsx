import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { UploadArrowIcon } from './icons'

interface UploadDropzoneProps {
  onFiles: (files: FileList) => void
  helperText?: string
}

export function UploadDropzone({ onFiles, helperText }: UploadDropzoneProps) {
  const { t } = useTranslation()
  const [dragActive, setDragActive] = useState(false)

  // The whole dropzone is a native <label> wrapping a visually hidden (not
  // display:none) file input. A tap/click on the label opens the picker
  // natively, so there is no programmatic input.click() that would bubble back
  // into the parent's onClick (which mobile Safari/Chrome can suppress). The
  // input itself is the focusable control, so Enter/Space open the picker too.
  // No `capture` attribute: without it iOS and Android offer camera, photo
  // library and files in their native chooser, and PDFs / multiple files work.
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setDragActive(true)
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragActive(false)
        if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files)
      }}
      onPaste={(e) => {
        const files = e.clipboardData?.files
        if (files && files.length > 0) onFiles(files)
      }}
      className={`relative flex cursor-pointer items-center justify-center gap-2.5 rounded-lg border-[1.5px] border-dashed bg-white px-[18px] py-[18px] text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 has-[:focus-visible]:ring-offset-2 ${
        dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
      }`}
    >
      <UploadArrowIcon className="h-5 w-5 flex-shrink-0 text-gray-500" />
      <span className="text-sm text-gray-500">
        <Trans
          i18nKey="uploadDropzone.prompt"
          components={{ link: <span className="font-semibold text-blue-700" /> }}
        />
        {` — ${helperText || t('uploadDropzone.defaultHint')}`}
      </span>
      <input
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="sr-only"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </label>
  )
}
