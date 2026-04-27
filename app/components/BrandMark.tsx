import Image from 'next/image'

type BrandMarkProps = {
  compact?: boolean
  label?: string
  light?: boolean
  title?: string
}

export function BrandMark({
  compact = false,
  label = "Castro's",
  light = false,
  title = 'Controle de Acesso',
}: BrandMarkProps) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`grid place-items-center overflow-hidden rounded-md bg-white shadow-sm ${
          compact ? 'size-14' : 'size-16'
        }`}
      >
        <Image
          src="/castros-logo-bordo.png"
          alt="Castro's"
          width={96}
          height={96}
          className="h-[92%] w-[92%] object-contain"
          priority={!compact}
        />
      </div>
      <div>
        <p
          className={`text-sm font-semibold uppercase tracking-[0.18em] ${
            light ? 'text-[#f3c7da]' : 'text-[#8a2d55]'
          }`}
        >
          {label}
        </p>
        <h1 className={`text-2xl font-bold ${light ? 'text-white' : 'text-[#2b1420]'}`}>
          {title}
        </h1>
      </div>
    </div>
  )
}
