import { useRef, useState } from 'react'
import { UploadArrowIcon } from './icons'

interface UploadDropzoneProps {
  onFiles: (files: FileList) => void
  helperText?: string
}

export function UploadDropzone({ onFiles, helperText }: UploadDropzoneProps) {
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
      }}
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
      className={`flex cursor-pointer items-center justify-center gap-2.5 rounded-lg border-[1.5px] border-dashed bg-white px-[18px] py-[18px] text-center transition-colors ${
        dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
      }`}
    >
      <UploadArrowIcon className="h-5 w-5 flex-shrink-0 text-gray-500" />
      <span className="text-sm text-gray-500">
        Drag files here or <span className="font-semibold text-blue-700">click to upload</span>
        {helperText ? ` — ${helperText}` : ' — no need to pick the type, the system recognizes the document'}
      </span>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
