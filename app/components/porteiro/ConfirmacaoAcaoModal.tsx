'use client'

import { ConfirmacaoAcao, MaterialEvento } from '../../lib/registros-types'
import { formatarCpf, formatarData, texto } from '../../lib/formatters'

type ConfirmacaoAcaoModalProps = {
  confirmacaoAcao: ConfirmacaoAcao
  saidaEventoMateriais: MaterialEvento[]
  registrandoSaida: string | null
  registrandoReentrada: string | null
  onAlterarSaidaMaterial: (materialId: string, valor: string) => void
  onCancelar: () => void
  onConfirmar: () => void
}

export function ConfirmacaoAcaoModal({
  confirmacaoAcao,
  saidaEventoMateriais,
  registrandoSaida,
  registrandoReentrada,
  onAlterarSaidaMaterial,
  onCancelar,
  onConfirmar,
}: ConfirmacaoAcaoModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b1420]/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-[#eadde3] bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold text-[#2b1420]">
          {confirmacaoAcao.tipo === 'saida' ? 'Confirmar saida' : 'Confirmar reentrada'}
        </h2>
        <p className="mt-2 text-sm text-[#6f4358]">
          {confirmacaoAcao.tipo === 'saida'
            ? 'Confirme para registrar a saida deste visitante.'
            : 'Confirme para registrar a reentrada deste visitante.'}
        </p>

        <div className="mt-4 rounded-lg bg-[#fffafb] p-4 text-sm text-[#4a2636]">
          <p><strong>Nome:</strong> {confirmacaoAcao.registro.nome || '-'}</p>
          <p className="mt-2"><strong>CPF:</strong> {formatarCpf(confirmacaoAcao.registro.documento) || '-'}</p>
          <p className="mt-2"><strong>Empresa:</strong> {confirmacaoAcao.registro.empresa || '-'}</p>
          {confirmacaoAcao.tipo === 'saida' ? (
            <p className="mt-2"><strong>Entrada:</strong> {formatarData(confirmacaoAcao.registro.hora_entrada)}</p>
          ) : (
            <p className="mt-2"><strong>Ultima saida:</strong> {formatarData(confirmacaoAcao.registro.hora_saida || '')}</p>
          )}
        </div>

        {confirmacaoAcao.tipo === 'saida' && confirmacaoAcao.registro.entrada_evento && (
          <div className="mt-4 rounded-lg border border-[#eadde3]">
            <div className="border-b border-[#f0e3e8] px-4 py-3">
              <h3 className="text-sm font-bold text-[#2b1420]">Saida de material</h3>
              <p className="mt-1 text-xs text-[#6f4358]">
                A entrada fica bloqueada. Informe apenas a quantidade que esta saindo agora.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[#fff7fa] text-xs font-bold uppercase tracking-[0.08em] text-[#8a2d55]">
                  <tr>
                    <th className="px-3 py-3">Qtde entrada</th>
                    <th className="px-3 py-3">Discriminacao</th>
                    <th className="px-3 py-3">Data</th>
                    <th className="px-3 py-3">Observacoes</th>
                    <th className="px-3 py-3">Qtde saida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f3e8ed]">
                  {saidaEventoMateriais.length ? (
                    saidaEventoMateriais.map((material) => (
                      <tr key={`saida-material-${material.id}`}>
                        <td className="px-3 py-3 font-semibold text-[#4a2636]">{texto(material.quantidade)}</td>
                        <td className="px-3 py-3 text-[#6f4358]">{texto(material.discriminacao)}</td>
                        <td className="px-3 py-3 text-[#6f4358]">
                          {material.data ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${material.data}T00:00:00`)) : '-'}
                        </td>
                        <td className="px-3 py-3 text-[#6f4358]">{texto(material.observacoes)}</td>
                        <td className="px-3 py-3">
                          <input
                            value={material.quantidadeSaida}
                            onChange={(event) => onAlterarSaidaMaterial(material.id, event.target.value)}
                            className="w-full rounded-md border border-[#e5d4dc] bg-white px-3 py-2 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-[#8a2d55]">
                        Este evento nao possui materiais digitados na entrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={
              (confirmacaoAcao.tipo === 'saida' && registrandoSaida === confirmacaoAcao.registro.id) ||
              (confirmacaoAcao.tipo === 'reentrada' && registrandoReentrada === confirmacaoAcao.registro.id)
            }
            className="rounded-md bg-[#97003f] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#7b0034] disabled:bg-[#c08aa3]"
          >
            {confirmacaoAcao.tipo === 'saida'
              ? registrandoSaida === confirmacaoAcao.registro.id
                ? 'Registrando...'
                : 'Confirmar saida'
              : registrandoReentrada === confirmacaoAcao.registro.id
                ? 'Registrando...'
                : 'Confirmar reentrada'}
          </button>
        </div>
      </div>
    </div>
  )
}
