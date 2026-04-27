'use client'

type ImageLightboxProps = {
  alt: string
  onClose: () => void
  src: string
}

export function ImageLightbox({ alt, onClose, src }: ImageLightboxProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b1420]/80 px-4 py-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-4xl rounded-lg bg-white p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[#2b1420]">{alt}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#d7b8c7] bg-white px-3 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
          >
            Fechar
          </button>
        </div>

        <div className="overflow-hidden rounded-md border border-[#eadde3] bg-[#fffafb]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-[75vh] w-full object-contain" />
        </div>
      </div>
    </div>
  )
}
