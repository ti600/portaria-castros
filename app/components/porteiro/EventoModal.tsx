'use client'

import { ChangeEvent, RefObject, useEffect, useRef } from 'react'
import { formatarTelefone, limparNumero } from '../../lib/formatters'
import { FormularioEvento, MaterialEvento } from '../../lib/registros-types'

type EventoModalProps = {
  eventoForm: FormularioEvento
  erroEvento: string
  eventoListaInputRef: RefObject<HTMLInputElement | null>
  eventoListaFotoPreview: string
  eventoListaFotoNome: string
  eventoListaFotoTipo: string
  carregandoCamera: boolean
  cameraDestino: 'visitante' | 'listaEvento'
  onFechar: () => void
  onAlterarCampoEvento: (campo: Exclude<keyof FormularioEvento, 'materiais'>, valor: string) => void
  onAdicionarMaterialEvento: () => void
  onAlterarMaterialEvento: (
    materialId: string,
    campo: Exclude<keyof MaterialEvento, 'id'>,
    valor: string
  ) => void
  onRemoverMaterialEvento: (materialId: string) => void
  onAbrirPreviaLista: () => void
  onAbrirSeletorArquivo: () => void
  onAbrirCameraListaEvento: () => void
  onAlterarListaEvento: (event: ChangeEvent<HTMLInputElement>) => void
  onLimparListaEvento: () => void
  onLimparFicha: () => void
  onSalvarFicha: () => void
}

export function EventoModal({
  eventoForm,
  erroEvento,
  eventoListaInputRef,
  eventoListaFotoPreview,
  eventoListaFotoNome,
  eventoListaFotoTipo,
  carregandoCamera,
  cameraDestino,
  onFechar,
  onAlterarCampoEvento,
  onAdicionarMaterialEvento,
  onAlterarMaterialEvento,
  onRemoverMaterialEvento,
  onAbrirPreviaLista,
  onAbrirSeletorArquivo,
  onAbrirCameraListaEvento,
  onAlterarListaEvento,
  onLimparListaEvento,
  onLimparFicha,
  onSalvarFicha,
}: EventoModalProps) {
  const erroRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (erroEvento) {
      erroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [erroEvento])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b1420]/70 p-4">
      <div className="w-full max-w-6xl rounded-xl border border-[#eadde3] dark:border-[#3a1f2a] bg-white dark:bg-[#1c1014] shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-[#f0e3e8] dark:border-[#351a25] px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-[#2b1420] dark:text-[#eddde6]">Controle de entrada e saida de materiais</h2>
            <p className="mt-1 text-sm text-[#6f4358] dark:text-[#b07f97]">
              Preencha a ficha do evento ou anexe a foto da folha ja preenchida.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md border border-[#d7b8c7] dark:border-[#4a2a38] bg-white dark:bg-[#1c1014] px-3 py-2 text-sm font-bold text-[#97003f] dark:text-[#f07a9e] transition hover:bg-[#fff0f6] dark:hover:bg-[#2a1520]"
          >
            Fechar
          </button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); onSalvarFicha() }}
          className="max-h-[calc(92vh-84px)] overflow-y-auto px-5 py-5"
        >
          <div className="rounded-lg border border-[#eadde3] dark:border-[#3a1f2a] bg-[#fffafb] dark:bg-[#180d11] p-4 text-sm text-[#6f4358] dark:text-[#b07f97]">
            Se a empresa ja trouxe a folha preenchida, basta anexar a foto da lista. Sem a foto, o preenchimento da entrada de materiais passa a ser obrigatorio.
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.45fr)_340px]">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="block md:col-span-2">
                  <span className="mb-2 block text-sm font-semibold text-[#4a2636] dark:text-[#c9a0b4]">Evento *</span>
                  <input
                    value={eventoForm.nome}
                    onChange={(event) => onAlterarCampoEvento('nome', event.target.value)}
                    className="w-full rounded-md border border-[#e5d4dc] dark:border-[#3d2030] bg-[#fffafb] dark:bg-[#180d11] px-3 py-2.5 outline-none transition focus:border-[#97003f] dark:focus:border-[#c4005a] focus:ring-4 focus:ring-[#f3c7da] dark:focus:ring-[#4a1f35] dark:text-[#eddde6] dark:placeholder:text-[#5a3347]"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#4a2636] dark:text-[#c9a0b4]">OS numero</span>
                  <input
                    value={eventoForm.osNumero}
                    onChange={(event) => onAlterarCampoEvento('osNumero', event.target.value)}
                    className="w-full rounded-md border border-[#e5d4dc] dark:border-[#3d2030] bg-[#fffafb] dark:bg-[#180d11] px-3 py-2.5 outline-none transition focus:border-[#97003f] dark:focus:border-[#c4005a] focus:ring-4 focus:ring-[#f3c7da] dark:focus:ring-[#4a1f35] dark:text-[#eddde6] dark:placeholder:text-[#5a3347]"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#4a2636] dark:text-[#c9a0b4]">Recebimento em</span>
                  <input
                    value={eventoForm.recebimentoEm}
                    onChange={(event) => onAlterarCampoEvento('recebimentoEm', event.target.value)}
                    className="w-full rounded-md border border-[#e5d4dc] dark:border-[#3d2030] bg-[#fffafb] dark:bg-[#180d11] px-3 py-2.5 outline-none transition focus:border-[#97003f] dark:focus:border-[#c4005a] focus:ring-4 focus:ring-[#f3c7da] dark:focus:ring-[#4a1f35] dark:text-[#eddde6] dark:placeholder:text-[#5a3347]"
                  />
                </label>

                <label className="block md:col-span-1">
                  <span className="mb-2 block text-sm font-semibold text-[#4a2636] dark:text-[#c9a0b4]">Responsavel *</span>
                  <input
                    value={eventoForm.responsavel}
                    onChange={(event) => onAlterarCampoEvento('responsavel', event.target.value)}
                    className="w-full rounded-md border border-[#e5d4dc] dark:border-[#3d2030] bg-[#fffafb] dark:bg-[#180d11] px-3 py-2.5 outline-none transition focus:border-[#97003f] dark:focus:border-[#c4005a] focus:ring-4 focus:ring-[#f3c7da] dark:focus:ring-[#4a1f35] dark:text-[#eddde6] dark:placeholder:text-[#5a3347]"
                    required={!eventoListaFotoPreview}
                  />
                </label>

                <label className="block md:col-span-1">
                  <span className="mb-2 block text-sm font-semibold text-[#4a2636] dark:text-[#c9a0b4]">Telefone *</span>
                  <input
                    value={formatarTelefone(eventoForm.fone)}
                    onChange={(event) => onAlterarCampoEvento('fone', event.target.value)}
                    inputMode="numeric"
                    placeholder="(00) 00000-0000"
                    className="w-full rounded-md border border-[#e5d4dc] dark:border-[#3d2030] bg-[#fffafb] dark:bg-[#180d11] px-3 py-2.5 outline-none transition focus:border-[#97003f] dark:focus:border-[#c4005a] focus:ring-4 focus:ring-[#f3c7da] dark:focus:ring-[#4a1f35] dark:text-[#eddde6] dark:placeholder:text-[#5a3347]"
                    required={!eventoListaFotoPreview}
                  />
                </label>
              </div>

              <div className="rounded-lg border border-[#eadde3] dark:border-[#3a1f2a]">
                <div className="border-b border-[#f0e3e8] dark:border-[#351a25] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-[#2b1420] dark:text-[#eddde6]">Entrada de material</h3>
                      <p className="mt-1 text-xs text-[#6f4358] dark:text-[#b07f97]">
                        Preencha esta grade quando a empresa nao trouxer a lista pronta.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onAdicionarMaterialEvento}
                      className="rounded-md border border-[#d7b8c7] dark:border-[#4a2a38] bg-white dark:bg-[#1c1014] px-3 py-2 text-xs font-bold text-[#97003f] dark:text-[#f07a9e] transition hover:bg-[#fff0f6] dark:hover:bg-[#2a1520]"
                    >
                      Adicionar linha
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="bg-[#fff7fa] dark:bg-[#1a0f13] text-xs font-bold uppercase tracking-[0.08em] text-[#8a2d55] dark:text-[#d47a9e]">
                      <tr>
                        <th className="w-[92px] px-3 py-3">Qtde</th>
                        <th className="px-3 py-3">Discriminacao</th>
                        <th className="w-[170px] px-3 py-3">Data</th>
                        <th className="px-3 py-3">Observacoes</th>
                        <th className="w-[110px] px-3 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f3e8ed] dark:divide-[#351a25]">
                      {eventoForm.materiais.map((material) => (
                        <tr key={material.id}>
                          <td className="px-3 py-3">
                            <input
                              value={material.quantidade}
                              onChange={(event) =>
                                onAlterarMaterialEvento(
                                  material.id,
                                  'quantidade',
                                  limparNumero(event.target.value)
                                )
                              }
                              inputMode="numeric"
                              placeholder="0"
                              className="w-20 rounded-md border border-[#e5d4dc] dark:border-[#3d2030] bg-white dark:bg-[#1c1014] px-3 py-2 outline-none transition focus:border-[#97003f] dark:focus:border-[#c4005a] focus:ring-4 focus:ring-[#f3c7da] dark:focus:ring-[#4a1f35] dark:text-[#eddde6] dark:placeholder:text-[#5a3347]"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              value={material.discriminacao}
                              onChange={(event) =>
                                onAlterarMaterialEvento(material.id, 'discriminacao', event.target.value)
                              }
                              className="w-full rounded-md border border-[#e5d4dc] dark:border-[#3d2030] bg-white dark:bg-[#1c1014] px-3 py-2 outline-none transition focus:border-[#97003f] dark:focus:border-[#c4005a] focus:ring-4 focus:ring-[#f3c7da] dark:focus:ring-[#4a1f35] dark:text-[#eddde6] dark:placeholder:text-[#5a3347]"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="date"
                              value={material.data}
                              onChange={(event) =>
                                onAlterarMaterialEvento(material.id, 'data', event.target.value)
                              }
                              className="w-[152px] rounded-md border border-[#e5d4dc] dark:border-[#3d2030] bg-white dark:bg-[#1c1014] px-3 py-2 outline-none transition focus:border-[#97003f] dark:focus:border-[#c4005a] focus:ring-4 focus:ring-[#f3c7da] dark:focus:ring-[#4a1f35] dark:text-[#eddde6]"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              value={material.observacoes}
                              onChange={(event) =>
                                onAlterarMaterialEvento(material.id, 'observacoes', event.target.value)
                              }
                              className="w-full rounded-md border border-[#e5d4dc] dark:border-[#3d2030] bg-white dark:bg-[#1c1014] px-3 py-2 outline-none transition focus:border-[#97003f] dark:focus:border-[#c4005a] focus:ring-4 focus:ring-[#f3c7da] dark:focus:ring-[#4a1f35] dark:text-[#eddde6] dark:placeholder:text-[#5a3347]"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => onRemoverMaterialEvento(material.id)}
                              className="rounded-md border border-[#d7b8c7] dark:border-[#4a2a38] bg-white dark:bg-[#1c1014] px-3 py-2 text-xs font-bold text-[#97003f] dark:text-[#f07a9e] transition hover:bg-[#fff0f6] dark:hover:bg-[#2a1520]"
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-[#eadde3] dark:border-[#3a1f2a] bg-[#fffafb] dark:bg-[#180d11] p-4">
              <h3 className="text-sm font-bold text-[#2b1420] dark:text-[#eddde6]">Foto da lista preenchida</h3>
              <p className="mt-1 text-sm text-[#6f4358] dark:text-[#b07f97]">
                Se a empresa ja chegar com a folha pronta, anexe a imagem aqui e voce nao precisa digitar os materiais.
              </p>

              <button
                type="button"
                onClick={eventoListaFotoPreview ? onAbrirPreviaLista : undefined}
                className="mt-4 grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-md border border-[#eadde3] dark:border-[#3a1f2a] bg-white dark:bg-[#1c1014]"
              >
                {eventoListaFotoPreview ? (
                  eventoListaFotoTipo === 'application/pdf' ? (
                    <div className="px-4 text-center">
                      <p className="text-sm font-bold text-[#97003f] dark:text-[#f07a9e]">PDF anexado</p>
                      <p className="mt-2 break-words text-xs text-[#6f4358] dark:text-[#b07f97]">
                        {eventoListaFotoNome || 'arquivo.pdf'}
                      </p>
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={eventoListaFotoPreview}
                      alt="Previa da lista do evento"
                      className="h-full w-full object-cover"
                    />
                  )
                ) : (
                  <span className="px-4 text-center text-sm font-semibold text-[#8a2d55] dark:text-[#d47a9e]">
                    Nenhuma lista anexada
                  </span>
                )}
              </button>

              <div className="mt-4 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onAbrirSeletorArquivo}
                    className="rounded-md border border-[#d7b8c7] dark:border-[#4a2a38] bg-white dark:bg-[#1c1014] px-3 py-2 text-sm font-bold text-[#97003f] dark:text-[#f07a9e] transition hover:bg-[#fff0f6] dark:hover:bg-[#2a1520]"
                  >
                    Anexar arquivo
                  </button>
                  <button
                    type="button"
                    onClick={onAbrirCameraListaEvento}
                    disabled={carregandoCamera}
                    className="rounded-md border border-[#d7b8c7] dark:border-[#4a2a38] bg-white dark:bg-[#1c1014] px-3 py-2 text-sm font-bold text-[#97003f] dark:text-[#f07a9e] transition hover:bg-[#fff0f6] dark:hover:bg-[#2a1520] disabled:text-[#c08aa3] dark:disabled:text-[#5a3347]"
                  >
                    {carregandoCamera && cameraDestino === 'listaEvento' ? 'Abrindo camera...' : 'Usar camera'}
                  </button>
                </div>
                <input
                  ref={eventoListaInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={onAlterarListaEvento}
                  className="hidden"
                />
                <p className="text-xs text-[#8a2d55] dark:text-[#d47a9e]">
                  Escolha se vai anexar a foto da folha, um PDF ou capturar direto pela webcam. Imagens tambem serao reduzidas antes do envio.
                </p>
                {eventoListaFotoPreview && (
                  <button
                    type="button"
                    onClick={onLimparListaEvento}
                    className="rounded-md border border-[#d7b8c7] dark:border-[#4a2a38] bg-white dark:bg-[#1c1014] px-3 py-2 text-xs font-bold text-[#97003f] dark:text-[#f07a9e] transition hover:bg-[#fff0f6] dark:hover:bg-[#2a1520]"
                  >
                    Remover foto da lista
                  </button>
                )}
              </div>
            </div>
          </div>

          {erroEvento && (
            <div ref={erroRef} className="mt-5 rounded-md border border-[#f1d38a] dark:border-[#4a3d00] bg-[#fff7db] dark:bg-[#1e1a00] px-4 py-3 text-sm font-medium text-[#8a5a00] dark:text-[#d4b000]">
              {erroEvento}
            </div>
          )}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onLimparFicha}
              className="rounded-md border border-[#d7b8c7] dark:border-[#4a2a38] bg-white dark:bg-[#1c1014] px-4 py-2 text-sm font-bold text-[#97003f] dark:text-[#f07a9e] transition hover:bg-[#fff0f6] dark:hover:bg-[#2a1520]"
            >
              Limpar ficha
            </button>
            <button
              type="button"
              onClick={onFechar}
              className="rounded-md border border-[#d7b8c7] dark:border-[#4a2a38] bg-white dark:bg-[#1c1014] px-4 py-2 text-sm font-bold text-[#97003f] dark:text-[#f07a9e] transition hover:bg-[#fff0f6] dark:hover:bg-[#2a1520]"
            >
              Fechar
            </button>
            <button
              type="submit"
              className="rounded-md bg-[#97003f] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#7b0034]"
            >
              Salvar ficha do evento
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
