'use client'

import { FormEvent, useState } from 'react'
import { formatarCpf, formatarData, formatarTelefone, texto } from '../../lib/formatters'
import { resumirTexto } from '../../lib/porteiro-consulta'
import { obterSituacaoRegistro } from '../../lib/status'

type RegistroAdmin = {
  id: string
  nome: string
  operador_entrada_email?: string | null
  operador_entrada_nome?: string | null
  documento?: string | null
  tipo_documento?: string | null
  telefone?: string | null
  empresa?: string | null
  servico?: string | null
  destino?: string | null
  responsavel?: string | null
  entrada_evento?: boolean | null
  evento_lista_foto_url?: string | null
  evento_nome?: string | null
  itens_entrada?: string | null
  foto_url?: string | null
  hora_entrada?: string | null
  hora_saida?: string | null
}

type RegistrosSectionProps = {
  dataInicio: string
  dataFim: string
  pesquisaRegistro: string
  registros: RegistroAdmin[]
  idsReentrada: Set<string>
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void
  onDataInicioChange: (valor: string) => void
  onDataFimChange: (valor: string) => void
  onPesquisaRegistroChange: (valor: string) => void
  onExportarExcel: () => void
  onExportarPdf: () => void
  onAbrirImagem: (imagem: { alt: string; src: string }) => void
}

function ehPdfArquivo(valor?: string | null) {
  return (valor || '').toLowerCase().includes('.pdf')
}

export function RegistrosSection({
  dataInicio,
  dataFim,
  pesquisaRegistro,
  registros,
  idsReentrada,
  onSubmit,
  onDataInicioChange,
  onDataFimChange,
  onPesquisaRegistroChange,
  onExportarExcel,
  onExportarPdf,
  onAbrirImagem,
}: RegistrosSectionProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; registro: RegistroAdmin } | null>(null)

  return (
    <section className="rounded-xl border border-[#eadde3] dark:border-[#3a1f2a] bg-white dark:bg-[#1c1014] shadow-sm">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 border-b border-[#f0e3e8] dark:border-[#351a25] px-4 py-4 sm:px-5"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold dark:text-[#eddde6]">Registros de entrada</h2>
            <p className="mt-1 text-sm text-[#6f4358] dark:text-[#b07f97]">
              Consulte por periodo e exporte apenas o recorte necessario.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onExportarExcel}
              className="rounded-md border border-[#d7b8c7] dark:border-[#4a2a38] bg-white dark:bg-[#1c1014] px-4 py-2 text-sm font-bold text-[#97003f] dark:text-[#f07a9e] transition hover:bg-[#fff0f6] dark:hover:bg-[#2a1520]"
            >
              Exportar Excel
            </button>
            <button
              type="button"
              onClick={onExportarPdf}
              className="rounded-md bg-[#97003f] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#7b0034]"
            >
              Exportar PDF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-lg bg-[#fffafb] dark:bg-[#180d11] p-3 lg:grid-cols-[180px_180px_minmax(220px,1fr)_auto]">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#4a2636] dark:text-[#c9a0b4]">Data inicial</span>
            <input
              type="date"
              value={dataInicio}
              onChange={(event) => onDataInicioChange(event.target.value)}
              className="w-full rounded-md border border-[#e5d4dc] dark:border-[#3d2030] bg-[#fffafb] dark:bg-[#180d11] px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] dark:focus:border-[#c4005a] focus:ring-4 focus:ring-[#f3c7da] dark:focus:ring-[#4a1f35] dark:text-[#eddde6] dark:[color-scheme:dark]"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#4a2636] dark:text-[#c9a0b4]">Data final</span>
            <input
              type="date"
              value={dataFim}
              onChange={(event) => onDataFimChange(event.target.value)}
              className="w-full rounded-md border border-[#e5d4dc] dark:border-[#3d2030] bg-[#fffafb] dark:bg-[#180d11] px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] dark:focus:border-[#c4005a] focus:ring-4 focus:ring-[#f3c7da] dark:focus:ring-[#4a1f35] dark:text-[#eddde6] dark:[color-scheme:dark]"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#4a2636] dark:text-[#c9a0b4]">
              Pesquisar nome ou documento
            </span>
            <input
              value={pesquisaRegistro}
              onChange={(event) => onPesquisaRegistroChange(event.target.value)}
              placeholder="Ex.: Marcelo ou 123456789"
              className="w-full rounded-md border border-[#e5d4dc] dark:border-[#3d2030] bg-[#fffafb] dark:bg-[#180d11] px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] dark:focus:border-[#c4005a] focus:ring-4 focus:ring-[#f3c7da] dark:focus:ring-[#4a1f35] dark:text-[#eddde6] dark:placeholder:text-[#5a3347]"
            />
          </label>

          <button
            type="submit"
            className="self-end rounded-md border border-[#d7b8c7] dark:border-[#4a2a38] bg-white dark:bg-[#1c1014] px-4 py-2.5 text-sm font-bold text-[#97003f] dark:text-[#f07a9e] transition hover:bg-[#fff0f6] dark:hover:bg-[#2a1520]"
          >
            Aplicar filtro
          </button>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-[#fff7fa] dark:bg-[#1a0f13] text-xs font-bold uppercase tracking-[0.08em] text-[#8a2d55] dark:text-[#d47a9e]">
            <tr>
              <th className="w-14 px-2 py-3">Foto</th>
              <th className="w-28 px-3 py-3">Nome</th>
              <th className="w-28 px-3 py-3">Documento</th>
              <th className="w-28 px-3 py-3">Telefone</th>
              <th className="w-24 px-3 py-3">Empresa</th>
              <th className="w-24 px-3 py-3">Servico</th>
              <th className="w-24 px-3 py-3">Destino</th>
              <th className="w-24 px-3 py-3">Responsavel</th>
              <th className="w-36 px-3 py-3">Operador</th>
              <th className="w-32 px-3 py-3">Evento / Itens</th>
              <th className="w-14 px-2 py-3">Anexo</th>
              <th className="w-28 px-3 py-3">Entrada</th>
              <th className="w-28 px-3 py-3">Saida</th>
              <th className="w-20 px-3 py-3">Situacao</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f3e8ed] dark:divide-[#351a25]">
            {registros.map((registro) => (
              <tr key={registro.id} className="hover:bg-[#fffafb] dark:hover:bg-[#180d11]">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      registro.foto_url
                        ? onAbrirImagem({
                            alt: `Foto de ${registro.nome}`,
                            src: registro.foto_url,
                          })
                        : undefined
                    }
                    className="size-12 overflow-hidden rounded-md border border-[#eadde3] dark:border-[#3a1f2a] bg-[#fffafb] dark:bg-[#180d11]"
                  >
                    {registro.foto_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={registro.foto_url}
                        alt={`Foto de ${registro.nome}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-sm font-black text-[#97003f] dark:text-[#f07a9e]">
                        {registro.nome?.charAt(0).toUpperCase() || '?'}
                      </div>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3 font-semibold dark:text-[#eddde6]">{texto(registro.nome)}</td>
                <td className="px-4 py-3 text-[#6f4358] dark:text-[#b07f97]">
                  {registro.documento ? (
                    <div>
                      {registro.tipo_documento === 'rg' && (
                        <span className="mb-0.5 block text-[10px] font-bold uppercase text-[#8a2d55] dark:text-[#d47a9e]">RG</span>
                      )}
                      <span>{registro.tipo_documento === 'rg' ? registro.documento : formatarCpf(registro.documento)}</span>
                    </div>
                  ) : '-'}
                </td>
                <td className="px-4 py-3 text-[#6f4358] dark:text-[#b07f97]">{formatarTelefone(registro.telefone) || '-'}</td>
                <td className="px-4 py-3 text-[#6f4358] dark:text-[#b07f97]">{texto(registro.empresa)}</td>
                <td className="px-4 py-3 text-[#6f4358] dark:text-[#b07f97]">{texto(registro.servico)}</td>
                <td className="px-4 py-3 text-[#6f4358] dark:text-[#b07f97]">{texto(registro.destino)}</td>
                <td className="px-4 py-3 text-[#6f4358] dark:text-[#b07f97]">{texto(registro.responsavel)}</td>
                <td className="px-4 py-3 text-[#6f4358] dark:text-[#b07f97]">
                  <div className="space-y-1">
                    <p>{texto(registro.operador_entrada_nome)}</p>
                    <p className="text-xs">{texto(registro.operador_entrada_email)}</p>
                  </div>
                </td>
                <td
                  className="px-3 py-3 text-[#6f4358] dark:text-[#b07f97]"
                  onMouseEnter={(e) => {
                    if (!registro.entrada_evento) return
                    const rect = e.currentTarget.getBoundingClientRect()
                    const ALTURA_TOOLTIP = 160
                    const cabeAbaixo = rect.bottom + 8 + ALTURA_TOOLTIP < window.innerHeight
                    const y = cabeAbaixo ? rect.bottom + 8 : rect.top - ALTURA_TOOLTIP - 8
                    setTooltip({ x: rect.left, y, registro })
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {registro.entrada_evento ? (
                    <div className="cursor-default space-y-1">
                      <p className="font-semibold text-[#4a2636] dark:text-[#c9a0b4]">{resumirTexto(registro.evento_nome, 14)}</p>
                      <p className="text-xs leading-5">{resumirTexto(registro.itens_entrada, 18)}</p>
                    </div>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-4 py-3">
                  {registro.evento_lista_foto_url ? (
                    ehPdfArquivo(registro.evento_lista_foto_url) ? (
                      <button
                        type="button"
                        onClick={() =>
                          window.open(
                            registro.evento_lista_foto_url || '',
                            '_blank',
                            'noopener,noreferrer'
                          )
                        }
                        className="grid size-12 place-items-center overflow-hidden rounded-md border border-[#eadde3] dark:border-[#3a1f2a] bg-[#fffafb] dark:bg-[#180d11] text-[10px] font-bold text-[#97003f] dark:text-[#f07a9e]"
                      >
                        PDF
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          onAbrirImagem({
                            alt: `Anexo do evento de ${registro.nome}`,
                            src: registro.evento_lista_foto_url || '',
                          })
                        }
                        className="size-12 overflow-hidden rounded-md border border-[#eadde3] dark:border-[#3a1f2a] bg-[#fffafb] dark:bg-[#180d11]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={registro.evento_lista_foto_url}
                          alt={`Anexo do evento de ${registro.nome}`}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    )
                  ) : (
                    <span className="text-[#6f4358] dark:text-[#b07f97]">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[#6f4358] dark:text-[#b07f97]">{formatarData(registro.hora_entrada)}</td>
                <td className="px-4 py-3">
                  {registro.hora_saida ? (
                    <span className="text-[#6f4358] dark:text-[#b07f97]">{formatarData(registro.hora_saida)}</span>
                  ) : (
                    <span className="rounded-full bg-[#ffe6f0] dark:bg-[#2a1020] px-3 py-1 text-xs font-bold text-[#97003f] dark:text-[#f07a9e]">
                      Dentro
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const situacao = obterSituacaoRegistro(registro, idsReentrada)
                    const estilo =
                      situacao === 'Dentro'
                        ? 'bg-[#ffe6f0] dark:bg-[#2a1020] text-[#97003f] dark:text-[#f07a9e]'
                        : situacao === 'Reentrada'
                          ? 'bg-[#fff5d6] dark:bg-[#1e1a00] text-[#9a6800] dark:text-[#d4b000]'
                          : 'bg-[#f5eef2] dark:bg-[#2a1020] text-[#6f4358] dark:text-[#b07f97]'

                    return (
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${estilo}`}>
                        {situacao}
                      </span>
                    )
                  })()}
                </td>
              </tr>
            ))}
            {!registros.length && !dataInicio && !dataFim && !pesquisaRegistro.trim() && (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-[#8a2d55] dark:text-[#d47a9e]">
                  Preencha uma data ou pesquisa para carregar os registros.
                </td>
              </tr>
            )}
            {registros.length === 0 && (dataInicio || dataFim || pesquisaRegistro.trim()) && (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-[#8a2d55] dark:text-[#d47a9e]">
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 w-[320px] max-w-[42vw] rounded-lg border border-[#e7c8d6] dark:border-[#3a1f2a] bg-white dark:bg-[#1c1014] p-3 text-left shadow-lg"
          style={{ top: tooltip.y, left: Math.min(Math.max(tooltip.x, 8), window.innerWidth - 340) }}
        >
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#8a2d55] dark:text-[#d47a9e]">Evento</p>
          <p className="mt-1 text-sm font-semibold text-[#2b1420] dark:text-[#eddde6]">{texto(tooltip.registro.evento_nome)}</p>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.08em] text-[#8a2d55] dark:text-[#d47a9e]">Itens</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#6f4358] dark:text-[#b07f97]">
            {texto(tooltip.registro.itens_entrada).replace(/\s\|\s/g, '\n')}
          </p>
        </div>
      )}
    </section>
  )
}
