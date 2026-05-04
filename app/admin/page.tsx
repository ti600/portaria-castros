'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogsSection } from '../components/admin/LogsSection'
import { RegistrosSection } from '../components/admin/RegistrosSection'
import { BloqueiosSection } from '../components/admin/BloqueiosSection'
import { BrandMark } from '../components/BrandMark'
import { ImageLightbox } from '../components/ImageLightbox'
import { lerUsuarioLogado, limparSessaoUsuario } from '../lib/auth'
import { fimDoDiaLocalEmIso, inicioDoDiaLocalEmIso } from '../lib/date-range'
import { limparNome } from '../lib/formatters'
import { formatarAcaoLog, listarLogs, LogSistema, registrarLog } from '../lib/logs'
import { exportarRelatorioExcel, exportarRelatorioPdf } from '../lib/reports'
import { identificarReentradasMesmoDia } from '../lib/status'
import { supabase } from '../lib/supabase'

type Perfil = 'admin' | 'porteiro'

type Usuario = {
  id: string
  nome: string
  email: string
  perfil: Perfil
  ativo?: boolean | null
  created_at?: string | null
}

type Registro = {
  id: string
  nome: string
  operador_entrada_email?: string | null
  operador_entrada_nome?: string | null
  documento?: string | null
  telefone?: string | null
  empresa?: string | null
  servico?: string | null
  destino?: string | null
  responsavel?: string | null
  entrada_evento?: boolean | null
  evento_fone?: string | null
  evento_lista_foto_url?: string | null
  evento_nome?: string | null
  evento_os_numero?: string | null
  evento_recebimento_em?: string | null
  evento_responsavel?: string | null
  itens_entrada?: string | null
  foto_url?: string | null
  hora_entrada?: string | null
  hora_saida?: string | null
  created_at?: string | null
}

type NovoUsuario = {
  nome: string
  email: string
  senha: string
  perfil: Perfil
}

const usuarioInicial: NovoUsuario = {
  nome: '',
  email: '',
  senha: '',
  perfil: 'porteiro',
}

export default function Admin() {
  const [aba, setAba] = useState<'registros' | 'usuarios' | 'logs' | 'bloqueios'>('registros')
  const [admin, setAdmin] = useState<Usuario | null>(null)
  const [registros, setRegistros] = useState<Registro[]>([])
  const [dentroAgora, setDentroAgora] = useState(0)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [logs, setLogs] = useState<LogSistema[]>([])
  const [novoUsuario, setNovoUsuario] = useState<NovoUsuario>(usuarioInicial)
  const [imagemAberta, setImagemAberta] = useState<{ alt: string; src: string } | null>(null)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [pesquisaRegistro, setPesquisaRegistro] = useState('')
  const [senhaUsuarioId, setSenhaUsuarioId] = useState<string | null>(null)
  const [novaSenha, setNovaSenha] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvandoUsuario, setSalvandoUsuario] = useState(false)
  const [alterandoUsuario, setAlterandoUsuario] = useState<string | null>(null)
  const [salvandoSenha, setSalvandoSenha] = useState(false)
  const [carregandoLogs, setCarregandoLogs] = useState(false)
  const [logsConsultaExecutada, setLogsConsultaExecutada] = useState(false)
  const [dataInicioLog, setDataInicioLog] = useState('')
  const [dataFimLog, setDataFimLog] = useState('')
  const [pesquisaLog, setPesquisaLog] = useState('')
  const [acaoLog, setAcaoLog] = useState<'todos' | LogSistema['acao']>('todos')
  const [erro, setErro] = useState('')
  const [avisoLogs, setAvisoLogs] = useState('')
  const router = useRouter()

  async function obterHeadersAdmin() {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      throw new Error('Sua sessao expirou. Entre novamente para continuar.')
    }

    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    }
  }

  async function carregarRegistros() {
    if (!dataInicio && !dataFim && !pesquisaRegistro.trim()) {
      setRegistros([])
      return
    }

    let query = supabase.from('registros').select('*').order('created_at', { ascending: false })

    if (dataInicio) {
      query = query.gte('hora_entrada', inicioDoDiaLocalEmIso(dataInicio))
    }

    if (dataFim) {
      query = query.lte('hora_entrada', fimDoDiaLocalEmIso(dataFim))
    }

    if (pesquisaRegistro.trim()) {
      const termo = pesquisaRegistro.trim()
      query = query.or(`nome.ilike.%${termo}%,documento.ilike.%${termo}%`)
    }

    const { data, error } = await query

    if (error) {
      setErro('Nao foi possivel carregar os registros.')
      return
    }

    setRegistros((data || []) as Registro[])
  }

  async function carregarUsuarios() {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id,nome,email,perfil,ativo,created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setErro('Nao foi possivel carregar os usuarios.')
      return
    }

    setUsuarios((data || []) as Usuario[])
  }

  async function carregarDentroAgora() {
    const { count, error } = await supabase
      .from('registros')
      .select('id', { count: 'exact', head: true })
      .is('hora_saida', null)

    if (error) {
      setErro('Nao foi possivel carregar o total de pessoas dentro.')
      return
    }

    setDentroAgora(count || 0)
  }

  async function carregarLogs() {
    setCarregandoLogs(true)
    setAvisoLogs('')
    setLogsConsultaExecutada(true)

    const { data, error } = await listarLogs({
      limite: 100,
      dataInicio: dataInicioLog,
      dataFim: dataFimLog,
      pesquisa: pesquisaLog,
      acao: acaoLog === 'todos' ? '' : acaoLog,
    })

    if (error) {
      setLogs([])
      setAvisoLogs(
        'Os logs nao puderam ser carregados. Execute novamente o arquivo supabase-admin-recursos.sql no Supabase para aplicar as permissoes da autenticacao atual.'
      )
      setCarregandoLogs(false)
      return
    }

    setLogs(data)
    setCarregandoLogs(false)
  }

  useEffect(() => {
    async function carregarTudo() {
      try {
        const usuario = await lerUsuarioLogado()

        if (!usuario || usuario.perfil !== 'admin' || usuario.ativo === false) {
          router.push('/')
          return
        }

        setAdmin(usuario)
        setCarregando(true)
        setErro('')
        await Promise.all([carregarUsuarios(), carregarDentroAgora()])
        setLogs([])
        setAvisoLogs('')
        setLogsConsultaExecutada(false)
        setRegistros([])
        setCarregando(false)
      } catch {
        setErro('Nao foi possivel validar sua sessao. Entre novamente.')
        setCarregando(false)
        router.push('/')
      }
    }

    void carregarTudo()
  }, [router])

  const estatisticas = useMemo(() => {
    const usuariosAtivos = usuarios.filter((usuario) => usuario.ativo !== false).length

    return [
      { rotulo: 'Dentro agora', valor: dentroAgora },
      { rotulo: 'Registros', valor: registros.length },
      { rotulo: 'Usuarios ativos', valor: usuariosAtivos },
    ]
  }, [dentroAgora, registros, usuarios])

  const idsReentrada = useMemo(() => identificarReentradasMesmoDia(registros), [registros])
  const filtrosLogsAtivos = useMemo(
    () => Boolean(dataInicioLog || dataFimLog || pesquisaLog.trim() || acaoLog !== 'todos'),
    [acaoLog, dataFimLog, dataInicioLog, pesquisaLog]
  )

  const resumoLogs = useMemo(() => {
    if (avisoLogs) return avisoLogs
    if (!logs.length) return 'Nenhum log encontrado para os filtros aplicados.'

    const total = logs.length
    const descricaoAcao =
      acaoLog === 'todos'
        ? 'todas as acoes'
        : formatarAcaoLog(acaoLog)

    return `${total} ${total === 1 ? 'registro localizado' : 'registros localizados'} em ${descricaoAcao.toLowerCase()}.`
  }, [acaoLog, avisoLogs, logs])

  function limparFiltrosLogs() {
    setDataInicioLog('')
    setDataFimLog('')
    setPesquisaLog('')
    setAcaoLog('todos')
    setAvisoLogs('')
    setLogs([])
    setLogsConsultaExecutada(false)
  }

  async function criarUsuario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')

    if (!novoUsuario.nome.trim() || !novoUsuario.email.trim() || !novoUsuario.senha.trim()) {
      setErro('Preencha nome, e-mail e senha para criar o usuario.')
      return
    }

    setSalvandoUsuario(true)

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: await obterHeadersAdmin(),
        body: JSON.stringify({
          nome: novoUsuario.nome.trim(),
          email: novoUsuario.email.trim().toLowerCase(),
          senha: novoUsuario.senha,
          perfil: novoUsuario.perfil,
        }),
      })

      const resultado = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        throw new Error(resultado?.error || 'Nao foi possivel criar o usuario.')
      }
    } catch (error) {
      setSalvandoUsuario(false)
      setErro(error instanceof Error ? error.message : 'Nao foi possivel criar o usuario.')
      return
    }

    setSalvandoUsuario(false)

    await registrarLog({
      acao: 'usuario_criado',
      detalhes: `Usuario ${novoUsuario.email.trim()} criado com perfil ${novoUsuario.perfil}.`,
      usuarioEmail: admin?.email,
      usuarioNome: admin?.nome,
    })

    setNovoUsuario(usuarioInicial)
    await Promise.all([carregarUsuarios(), carregarLogs()])
  }

  async function toggleAtivo(usuario: Usuario) {
    setErro('')
    setAlterandoUsuario(usuario.id)

    const estaAtivo = usuario.ativo !== false
    const { error } = await supabase
      .from('usuarios')
      .update({ ativo: !estaAtivo })
      .eq('id', usuario.id)

    setAlterandoUsuario(null)

    if (error) {
      setErro('Nao foi possivel alterar o status do usuario.')
      return
    }

    await registrarLog({
      acao: 'usuario_status_alterado',
      detalhes: `Usuario ${usuario.email} ${estaAtivo ? 'desativado' : 'ativado'}.`,
      usuarioEmail: admin?.email,
      usuarioNome: admin?.nome,
    })

    await Promise.all([carregarUsuarios(), carregarLogs()])
  }

  async function atualizarSenha(usuario: Usuario) {
    setErro('')

    if (!novaSenha.trim()) {
      setErro('Informe uma nova senha para atualizar o usuario.')
      return
    }

    setSalvandoSenha(true)

    try {
      const response = await fetch(`/api/admin/users/${usuario.id}/password`, {
        method: 'PATCH',
        headers: await obterHeadersAdmin(),
        body: JSON.stringify({ senha: novaSenha }),
      })

      const resultado = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        throw new Error(resultado?.error || 'Nao foi possivel atualizar a senha.')
      }
    } catch (error) {
      setSalvandoSenha(false)
      setErro(error instanceof Error ? error.message : 'Nao foi possivel atualizar a senha.')
      return
    }

    setSalvandoSenha(false)

    await registrarLog({
      acao: 'senha_alterada',
      detalhes: `Senha alterada para ${usuario.email}.`,
      usuarioEmail: admin?.email,
      usuarioNome: admin?.nome,
    })

    setSenhaUsuarioId(null)
    setNovaSenha('')
    await carregarLogs()
  }

  async function atualizarDados() {
    setCarregando(true)
    setErro('')
    await Promise.all([carregarRegistros(), carregarUsuarios(), carregarLogs(), carregarDentroAgora()])
    setCarregando(false)
  }

  async function exportarExcel() {
    exportarRelatorioExcel(registros)
    await registrarLog({
      acao: 'relatorio_excel_exportado',
      detalhes: `Relatorio exportado com ${registros.length} registros.`,
      usuarioEmail: admin?.email,
      usuarioNome: admin?.nome,
    })
    await carregarLogs()
  }

  async function exportarPdf() {
    await exportarRelatorioPdf(registros)
    await registrarLog({
      acao: 'relatorio_pdf_exportado',
      detalhes: `Relatorio exportado com ${registros.length} registros.`,
      usuarioEmail: admin?.email,
      usuarioNome: admin?.nome,
    })
    await carregarLogs()
  }

  async function handleLogout() {
    await limparSessaoUsuario()
    router.push('/')
  }

  async function aplicarFiltrosRegistros(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    setErro('')
    await carregarRegistros()
  }

  if (carregando && !admin) {
    return (
      <main className="min-h-screen bg-[#fbf7f8] px-6 py-8 text-[#2b1420]">
        <div className="mx-auto w-full max-w-[1440px]">
          <div className="rounded-xl border border-[#eadde3] bg-white px-5 py-5 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex flex-col gap-3">
                <BrandMark compact label="Administracao" title="Painel da Portaria" />
                <p className="max-w-2xl text-sm text-[#6f4358]">
                  Preparando o ambiente administrativo e validando as permissoes do sistema.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-10 w-28 animate-pulse rounded-md bg-[#f7e5ec]" />
                <div className="h-10 w-28 animate-pulse rounded-md bg-[#f7e5ec]" />
                <div className="h-10 w-20 animate-pulse rounded-md bg-[#f7e5ec]" />
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                key={`loading-admin-card-${item}`}
                className="rounded-xl border border-[#eadde3] bg-white p-4 shadow-sm"
              >
                <div className="h-4 w-28 animate-pulse rounded bg-[#f7e5ec]" />
                <div className="mt-4 h-8 w-24 animate-pulse rounded bg-[#f3d3df]" />
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[0.82fr_1.18fr]">
            <div className="rounded-xl border border-[#eadde3] bg-white p-5 shadow-sm">
              <div className="h-6 w-36 animate-pulse rounded bg-[#f3d3df]" />
              <div className="mt-2 h-4 w-64 animate-pulse rounded bg-[#f7e5ec]" />

              <div className="mt-6 grid grid-cols-1 gap-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={`loading-admin-form-${index}`}>
                    <div className="mb-2 h-4 w-24 animate-pulse rounded bg-[#f7e5ec]" />
                    <div className="h-12 animate-pulse rounded-md bg-[#fbf1f5]" />
                  </div>
                ))}
                <div className="mt-2 h-12 animate-pulse rounded-md bg-[#f3d3df]" />
              </div>
            </div>

            <div className="rounded-xl border border-[#eadde3] bg-white p-5 shadow-sm">
              <div className="h-6 w-44 animate-pulse rounded bg-[#f3d3df]" />
              <div className="mt-2 h-4 w-56 animate-pulse rounded bg-[#f7e5ec]" />

              <div className="mt-6 space-y-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`loading-admin-list-${index}`}
                    className="rounded-lg border border-[#f0e3e8] bg-[#fffafb] p-4"
                  >
                    <div className="h-4 w-40 animate-pulse rounded bg-[#f3d3df]" />
                    <div className="mt-2 h-4 w-56 animate-pulse rounded bg-[#f7e5ec]" />
                    <div className="mt-4 flex gap-2">
                      <div className="h-9 w-24 animate-pulse rounded-md bg-[#f7e5ec]" />
                      <div className="h-9 w-28 animate-pulse rounded-md bg-[#f7e5ec]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#fbf7f8] text-[#2b1420]">
      <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-xl border border-[#eadde3] bg-white px-4 py-4 shadow-sm sm:px-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex flex-col gap-3">
              <BrandMark compact label="Administracao" title="Painel da Portaria" />
              <p className="max-w-2xl text-sm text-[#6f4358]">
                Operacao administrativa, relatorios, usuarios e auditoria em um unico painel.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-md border border-[#eadde3] bg-[#fffafb] px-3 py-2 text-sm font-medium text-[#6f4358]">
                {admin?.nome || 'Administrador'}
              </div>
              <button
                type="button"
                onClick={atualizarDados}
                disabled={carregando}
                className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6] disabled:text-[#c08aa3]"
              >
                Atualizar
              </button>
              <button
                type="button"
                onClick={() => router.push('/porteiro')}
                className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
              >
                Abrir portaria
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md bg-[#5f0029] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#4d0021]"
              >
                Sair
              </button>
            </div>
          </div>
        </header>

        {erro && (
          <div className="mb-5 rounded-md border border-[#f3b7cc] bg-[#fff0f6] px-4 py-3 text-sm font-medium text-[#97003f]">
            {erro}
          </div>
        )}

        <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {estatisticas.map((item) => (
            <div
              key={item.rotulo}
            className="rounded-xl border border-[#eadde3] bg-white p-4 shadow-sm"
          >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#8a2d55]">{item.rotulo}</p>
                  <p className="mt-3 text-3xl font-black text-[#97003f]">{item.valor}</p>
                </div>
                <div className="rounded-full bg-[#fff0f6] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a2d55]">
                  Painel
                </div>
              </div>
            </div>
          ))}
        </section>

        <div className="mb-5 inline-flex rounded-xl border border-[#e5d4dc] bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setAba('registros')}
            className={`rounded-md px-4 py-2 text-sm font-bold transition ${
              aba === 'registros'
                ? 'bg-[#97003f] text-white'
                : 'text-[#6f4358] hover:bg-[#fff0f6]'
            }`}
          >
            Registros
          </button>
          <button
            type="button"
            onClick={() => setAba('usuarios')}
            className={`rounded-md px-4 py-2 text-sm font-bold transition ${
              aba === 'usuarios'
                ? 'bg-[#97003f] text-white'
                : 'text-[#6f4358] hover:bg-[#fff0f6]'
            }`}
          >
            Usuarios
          </button>
          <button
            type="button"
            onClick={() => setAba('bloqueios')}
            className={`rounded-md px-4 py-2 text-sm font-bold transition ${
              aba === 'bloqueios'
                ? 'bg-[#97003f] text-white'
                : 'text-[#6f4358] hover:bg-[#fff0f6]'
            }`}
          >
            Bloqueios
          </button>
          <button
            type="button"
            onClick={() => setAba('logs')}
            className={`rounded-md px-4 py-2 text-sm font-bold transition ${
              aba === 'logs'
                ? 'bg-[#97003f] text-white'
                : 'text-[#6f4358] hover:bg-[#fff0f6]'
            }`}
          >
            Logs
          </button>
        </div>

        {aba === 'registros' && (
          <RegistrosSection
            dataInicio={dataInicio}
            dataFim={dataFim}
            pesquisaRegistro={pesquisaRegistro}
            registros={registros}
            idsReentrada={idsReentrada}
            onSubmit={aplicarFiltrosRegistros}
            onDataInicioChange={setDataInicio}
            onDataFimChange={setDataFim}
            onPesquisaRegistroChange={setPesquisaRegistro}
            onExportarExcel={exportarExcel}
            onExportarPdf={exportarPdf}
            onAbrirImagem={setImagemAberta}
          />
        )}
        {aba === 'usuarios' && (
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-[0.82fr_1.18fr]">
            <form
              onSubmit={criarUsuario}
              className="rounded-lg border border-[#eadde3] bg-white p-4 shadow-sm sm:p-5"
            >
              <h2 className="text-lg font-bold">Novo usuario</h2>

              <div className="mt-4 grid grid-cols-1 gap-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Nome</span>
                  <input
                    value={novoUsuario.nome}
                    onChange={(event) =>
                      setNovoUsuario({ ...novoUsuario, nome: limparNome(event.target.value) })
                    }
                    className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                    pattern="[A-Za-zÀ-ÿ' -]+"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#4a2636]">E-mail</span>
                  <input
                    type="email"
                    value={novoUsuario.email}
                    onChange={(event) =>
                      setNovoUsuario({ ...novoUsuario, email: event.target.value })
                    }
                    className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Senha</span>
                  <input
                    type="password"
                    value={novoUsuario.senha}
                    onChange={(event) =>
                      setNovoUsuario({ ...novoUsuario, senha: event.target.value })
                    }
                    className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Perfil</span>
                  <select
                    value={novoUsuario.perfil}
                    onChange={(event) =>
                      setNovoUsuario({ ...novoUsuario, perfil: event.target.value as Perfil })
                    }
                    className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                  >
                    <option value="porteiro">Porteiro</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
              </div>

              <button
                type="submit"
                disabled={salvandoUsuario}
                className="mt-5 w-full rounded-md bg-[#97003f] px-4 py-3 font-bold text-white transition hover:bg-[#7b0034] disabled:bg-[#c08aa3]"
              >
                {salvandoUsuario ? 'Criando...' : 'Criar usuario'}
              </button>
            </form>

            <div className="rounded-lg border border-[#eadde3] bg-white shadow-sm">
              <div className="border-b border-[#f0e3e8] px-4 py-4 sm:px-5">
                <h2 className="text-lg font-bold">Usuarios cadastrados</h2>
              </div>

              <div className="divide-y divide-[#f3e8ed]">
                {usuarios.map((usuario) => {
                  const estaAtivo = usuario.ativo !== false
                  const editandoSenha = senhaUsuarioId === usuario.id

                  return (
                    <div key={usuario.id} className="px-4 py-4 sm:px-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="font-semibold">{usuario.nome}</p>
                          <p className="text-sm text-[#6f4358]">
                            {usuario.email} · {usuario.perfil}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${
                              estaAtivo
                                ? 'bg-[#ffe6f0] text-[#97003f]'
                                : 'bg-[#f7dde8] text-[#5f0029]'
                            }`}
                          >
                            {estaAtivo ? 'Ativo' : 'Inativo'}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleAtivo(usuario)}
                            disabled={alterandoUsuario === usuario.id}
                            className="rounded-md border border-[#d7b8c7] bg-white px-3 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6] disabled:text-[#c08aa3]"
                          >
                            {alterandoUsuario === usuario.id
                              ? 'Salvando...'
                              : estaAtivo
                                ? 'Desativar'
                                : 'Ativar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSenhaUsuarioId(editandoSenha ? null : usuario.id)
                              setNovaSenha('')
                            }}
                            className="rounded-md bg-[#97003f] px-3 py-2 text-sm font-bold text-white transition hover:bg-[#7b0034]"
                          >
                            {editandoSenha ? 'Cancelar' : 'Trocar senha'}
                          </button>
                        </div>
                      </div>

                      {editandoSenha && (
                        <div className="mt-4 flex flex-col gap-3 rounded-md border border-[#eadde3] bg-[#fffafb] p-3 sm:flex-row sm:items-center">
                          <input
                            type="password"
                            value={novaSenha}
                            onChange={(event) => setNovaSenha(event.target.value)}
                            placeholder="Nova senha"
                            className="w-full rounded-md border border-[#e5d4dc] bg-white px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                          />
                          <button
                            type="button"
                            onClick={() => atualizarSenha(usuario)}
                            disabled={salvandoSenha}
                            className="rounded-md bg-[#5f0029] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#4d0021] disabled:bg-[#c08aa3]"
                          >
                            {salvandoSenha ? 'Salvando...' : 'Salvar senha'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}

                {usuarios.length === 0 && (
                  <div className="px-4 py-8 text-center text-[#8a2d55]">Nenhum usuario cadastrado.</div>
                )}
              </div>
            </div>
          </section>
        )}

        {aba === 'logs' && (
          <LogsSection
            acaoLog={acaoLog}
            avisoLogs={avisoLogs}
            carregandoLogs={carregandoLogs}
            dataFimLog={dataFimLog}
            dataInicioLog={dataInicioLog}
            filtrosLogsAtivos={filtrosLogsAtivos}
            logs={logs}
            logsConsultaExecutada={logsConsultaExecutada}
            pesquisaLog={pesquisaLog}
            resumoLogs={resumoLogs}
            onAcaoLogChange={setAcaoLog}
            onConsultarLogs={carregarLogs}
            onDataFimLogChange={setDataFimLog}
            onDataInicioLogChange={setDataInicioLog}
            onLimparFiltros={limparFiltrosLogs}
            onPesquisaLogChange={setPesquisaLog}
          />
        )}

        {aba === 'bloqueios' && (
          <section className="rounded-lg border border-[#eadde3] bg-white p-6 shadow-sm">
            <BloqueiosSection />
          </section>
        )}
      </div>

      {imagemAberta && (
        <ImageLightbox
          alt={imagemAberta.alt}
          onClose={() => setImagemAberta(null)}
          src={imagemAberta.src}
        />
      )}
    </main>
  )
}
