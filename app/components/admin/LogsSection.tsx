'use client'

import { formatarData, texto } from '../../lib/formatters'
import { formatarAcaoLog, LogSistema, opcoesAcaoLog } from '../../lib/logs'

type LogsSectionProps = {
  acaoLog: 'todos' | LogSistema['acao']
  avisoLogs: string
  carregandoLogs: boolean
  dataFimLog: string
  dataInicioLog: string
  filtrosLogsAtivos: boolean
  logs: LogSistema[]
  logsConsultaExecutada: boolean
  pesquisaLog: string
  resumoLogs: string
  onAcaoLogChange: (valor: 'todos' | LogSistema['acao']) => void
  onConsultarLogs: () => void
  onDataFimLogChange: (valor: string) => void
  onDataInicioLogChange: (valor: string) => void
  onLimparFiltros: () => void
  onPesquisaLogChange: (valor: string) => void
}

export function LogsSection({
  acaoLog,
  avisoLogs,
  carregandoLogs,
  dataFimLog,
  dataInicioLog,
  filtrosLogsAtivos,
  logs,
  logsConsultaExecutada,
  pesquisaLog,
  resumoLogs,
  onAcaoLogChange,
  onConsultarLogs,
  onDataFimLogChange,
  onDataInicioLogChange,
  onLimparFiltros,
  onPesquisaLogChange,
}: LogsSectionProps) {
  return (
    <section className="rounded-lg border border-[#eadde3] bg-white shadow-sm dark:border-[#3a1f2a] dark:bg-[#1c1014]">
      <div className="border-b border-[#f0e3e8] px-4 py-4 sm:px-5 dark:border-[#351a25]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8a2d55] dark:text-[#d47a9e]">
              Auditoria
            </p>
            <h2 className="mt-1 text-lg font-bold dark:text-[#eddde6]">Logs do sistema</h2>
            <p className="mt-1 text-sm text-[#6f4358] dark:text-[#b07f97]">
              Consulte o historico operacional, administrativo e de exportacoes realizadas no
              sistema.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button
              type="button"
              onClick={onLimparFiltros}
              className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2.5 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6] dark:border-[#4a2a38] dark:bg-[#1c1014] dark:text-[#f07a9e] dark:hover:bg-[#2a1520]"
            >
              Limpar filtros
            </button>
            <button
              type="button"
              onClick={onConsultarLogs}
              className="rounded-md bg-[#97003f] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#7b0034]"
            >
              {carregandoLogs ? 'Consultando...' : 'Consultar logs'}
            </button>
          </div>
        </div>
      </div>

      {avisoLogs && (
        <div className="border-b border-[#f0e3e8] bg-[#fff0f6] px-4 py-3 text-sm font-medium text-[#97003f] sm:px-5 dark:border-[#351a25] dark:bg-[#2a1020] dark:text-[#f07a9e]">
          {avisoLogs}
        </div>
      )}

      <div className="border-b border-[#f0e3e8] bg-[#fffafb] px-4 py-4 sm:px-5 dark:border-[#351a25] dark:bg-[#180d11]">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[180px_180px_220px_minmax(0,1fr)]">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#4a2636] dark:text-[#c9a0b4]">Data inicial</span>
            <input
              type="date"
              value={dataInicioLog}
              onChange={(event) => onDataInicioLogChange(event.target.value)}
              className="w-full rounded-md border border-[#e5d4dc] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da] dark:border-[#3d2030] dark:bg-[#180d11] dark:text-[#eddde6] dark:[color-scheme:dark] dark:focus:border-[#c4005a] dark:focus:ring-[#4a1f35]"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#4a2636] dark:text-[#c9a0b4]">Data final</span>
            <input
              type="date"
              value={dataFimLog}
              onChange={(event) => onDataFimLogChange(event.target.value)}
              className="w-full rounded-md border border-[#e5d4dc] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da] dark:border-[#3d2030] dark:bg-[#180d11] dark:text-[#eddde6] dark:[color-scheme:dark] dark:focus:border-[#c4005a] dark:focus:ring-[#4a1f35]"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#4a2636] dark:text-[#c9a0b4]">Tipo de acao</span>
            <select
              value={acaoLog}
              onChange={(event) => onAcaoLogChange(event.target.value as 'todos' | LogSistema['acao'])}
              className="w-full rounded-md border border-[#e5d4dc] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da] dark:border-[#3d2030] dark:bg-[#180d11] dark:text-[#eddde6] dark:focus:border-[#c4005a] dark:focus:ring-[#4a1f35]"
            >
              <option value="todos">Todas as acoes</option>
              {opcoesAcaoLog.map((opcao) => (
                <option key={opcao.value} value={opcao.value}>
                  {opcao.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#4a2636] dark:text-[#c9a0b4]">
              Pesquisar nos logs
            </span>
            <input
              value={pesquisaLog}
              onChange={(event) => onPesquisaLogChange(event.target.value)}
              placeholder="Operador, e-mail, acao ou detalhe"
              className="w-full rounded-md border border-[#e5d4dc] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da] dark:border-[#3d2030] dark:bg-[#180d11] dark:text-[#eddde6] dark:placeholder:text-[#5a3347] dark:focus:border-[#c4005a] dark:focus:ring-[#4a1f35]"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-full border border-[#eadde3] bg-white px-3 py-1 text-[#8a2d55] dark:border-[#3a1f2a] dark:bg-[#180d11] dark:text-[#d47a9e]">
              Exibicao maxima de 100 registros por consulta
            </span>
            {filtrosLogsAtivos ? (
              <span className="rounded-full bg-[#fff0f6] px-3 py-1 text-[#97003f] dark:bg-[#2a0f1a] dark:text-[#f07a9e]">
                Filtros ativos
              </span>
            ) : null}
          </div>
          <p className="text-xs text-[#8a2d55] dark:text-[#d47a9e]">Use os filtros para recortar melhor a auditoria.</p>
        </div>
      </div>

      {!avisoLogs && logsConsultaExecutada && (
        <div className="border-b border-[#f0e3e8] px-4 py-3 text-sm font-medium text-[#8a2d55] sm:px-5 dark:border-[#351a25] dark:text-[#d47a9e]">
          {resumoLogs}
        </div>
      )}

      <div className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="bg-[#fff7fa] text-xs font-bold uppercase tracking-[0.08em] text-[#8a2d55] dark:bg-[#180d11] dark:text-[#d47a9e]">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Acao</th>
                <th className="px-4 py-3">Operador</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3e8ed] dark:divide-[#2a1020]">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-[#fffafb] dark:hover:bg-[#1e0f16]">
                  <td className="px-4 py-3 text-[#6f4358] dark:text-[#b07f97]">{formatarData(log.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[#fff0f6] px-3 py-1 text-xs font-bold text-[#97003f] dark:bg-[#2a0f1a] dark:text-[#d47a9e]">
                      {formatarAcaoLog(log.acao)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-[#2b1420] dark:text-[#eddde6]">{texto(log.usuario_nome)}</td>
                  <td className="px-4 py-3 text-[#6f4358] dark:text-[#b07f97]">{texto(log.usuario_email)}</td>
                  <td className="px-4 py-3 text-[#6f4358] dark:text-[#b07f97]">{texto(log.detalhes)}</td>
                </tr>
              ))}
              {!logs.length && !avisoLogs && logsConsultaExecutada && (
                <tr>
                  <td colSpan={5} className="px-0 py-0">
                    <div className="grid place-items-center px-6 py-12 text-center">
                      <div className="max-w-md">
                        <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#8a2d55] dark:text-[#d47a9e]">
                          Nenhum resultado
                        </p>
                        <p className="mt-2 text-sm text-[#6f4358] dark:text-[#b07f97]">
                          Nenhum log encontrado para os filtros informados. Ajuste o periodo, a
                          acao ou a pesquisa textual e consulte novamente.
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {!logs.length && !avisoLogs && !logsConsultaExecutada && (
                <tr>
                  <td colSpan={5} className="px-0 py-0">
                    <div className="grid place-items-center px-6 py-14 text-center">
                      <div className="max-w-lg">
                        <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#8a2d55] dark:text-[#d47a9e]">
                          Auditoria pronta para consulta
                        </p>
                        <p className="mt-2 text-sm text-[#6f4358] dark:text-[#b07f97]">
                          Defina um periodo, refine por tipo de acao se quiser, e clique em
                          consultar logs para carregar somente o recorte desejado.
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
