'use client'

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrandMark } from '../components/BrandMark'
import { ImageLightbox } from '../components/ImageLightbox'
import { lerUsuarioLogado, limparSessaoUsuario } from '../lib/auth'
import { registrarLog } from '../lib/logs'
import { otimizarFoto } from '../lib/photo'
import { supabase } from '../lib/supabase'

type Perfil = 'admin' | 'porteiro'

type Usuario = {
  id: string
  nome: string
  email: string
  perfil: Perfil
  ativo?: boolean | null
}

type Registro = {
  id: string
  nome: string
  documento?: string | null
  telefone?: string | null
  empresa?: string | null
  servico?: string | null
  destino?: string | null
  responsavel?: string | null
  entrada_evento?: boolean | null
  evento_nome?: string | null
  itens_entrada?: string | null
  foto_url?: string | null
  hora_entrada: string
  hora_saida?: string | null
}

type ConfirmacaoAcao =
  | { tipo: 'saida'; registro: Registro }
  | { tipo: 'reentrada'; registro: Registro }

type FiltroConsulta = 'todos' | 'dentro' | 'reentrada' | 'saida'

type FormularioEntrada = {
  nome: string
  documento: string
  telefone: string
  empresa: string
  servico: string
  destino: string
  responsavel: string
  entradaEvento: boolean
  eventoNome: string
  itensEntrada: string
}

const formularioInicial: FormularioEntrada = {
  nome: '',
  documento: '',
  telefone: '',
  empresa: '',
  servico: '',
  destino: '',
  responsavel: '',
  entradaEvento: false,
  eventoNome: '',
  itensEntrada: '',
}

const BUCKET_FOTOS = 'registros-fotos'
const TAMANHO_MAXIMO_FOTO = 5 * 1024 * 1024
function chaveRegistro(registro: Registro) {
  return `${(registro.documento || '').trim().toLowerCase()}::${registro.nome.trim().toLowerCase()}`
}

function ehMesmoDia(dataIso: string, referencia: Date) {
  const data = new Date(dataIso)

  return (
    data.getFullYear() === referencia.getFullYear() &&
    data.getMonth() === referencia.getMonth() &&
    data.getDate() === referencia.getDate()
  )
}

function identificarReentradas(registros: Registro[]) {
  const chavesReentrada = new Set<string>()
  const historico = [...registros].sort(
    (a, b) => new Date(a.hora_entrada).getTime() - new Date(b.hora_entrada).getTime()
  )
  const jaSaiuPorPessoa = new Set<string>()

  historico.forEach((registro) => {
    const chave = chaveRegistro(registro)

    if (jaSaiuPorPessoa.has(chave)) {
      chavesReentrada.add(registro.id)
    }

    if (registro.hora_saida) {
      jaSaiuPorPessoa.add(chave)
    }
  })

  return chavesReentrada
}

function formatarData(valor: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(valor))
}

function texto(valor?: string | null) {
  return valor && valor.trim() ? valor : '-'
}

function limparNome(valor: string) {
  return valor.replace(/[^\p{L}\s'-]/gu, '').replace(/\s{2,}/g, ' ')
}

function limparNumero(valor: string) {
  return valor.replace(/\D/g, '')
}

function traduzirErroUpload(message: string) {
  const mensagem = message.toLowerCase()

  if (
    mensagem.includes('bucket') ||
    mensagem.includes('not found') ||
    mensagem.includes('row-level security') ||
    mensagem.includes('permission') ||
    mensagem.includes('policy') ||
    mensagem.includes('unauthorized')
  ) {
    return 'O upload da foto falhou porque o Storage do Supabase ainda nao esta configurado. Execute o arquivo supabase-fotos.sql no Supabase e tente novamente.'
  }

  return `Nao foi possivel enviar a foto: ${message}`
}

async function enviarFoto(foto: File) {
  const fotoOtimizada = await otimizarFoto(foto)
  const caminho = `entradas/${Date.now()}-${crypto.randomUUID()}.jpg`

  const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(caminho, fotoOtimizada, {
    cacheControl: '3600',
    contentType: 'image/jpeg',
    upsert: false,
  })

  if (error) {
    console.error('Erro Supabase Storage:', error)
    throw new Error(traduzirErroUpload(error.message))
  }

  const { data } = supabase.storage.from(BUCKET_FOTOS).getPublicUrl(caminho)
  return data.publicUrl
}

export default function Porteiro() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [dentro, setDentro] = useState<Registro[]>([])
  const [form, setForm] = useState<FormularioEntrada>(formularioInicial)
  const [foto, setFoto] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState('')
  const [imagemAberta, setImagemAberta] = useState<{ alt: string; src: string } | null>(null)
  const [buscaDentro, setBuscaDentro] = useState('')
  const [buscaHospedesDentro, setBuscaHospedesDentro] = useState('')
  const [buscaSaidos, setBuscaSaidos] = useState('')
  const [saidos, setSaidos] = useState<Registro[]>([])
  const [consultaRegistros, setConsultaRegistros] = useState<Registro[]>([])
  const [consultaExecutada, setConsultaExecutada] = useState(false)
  const [consultaDataInicio, setConsultaDataInicio] = useState('')
  const [consultaDataFim, setConsultaDataFim] = useState('')
  const [consultaPesquisa, setConsultaPesquisa] = useState('')
  const [consultaFiltro, setConsultaFiltro] = useState<FiltroConsulta>('todos')
  const [cameraAberta, setCameraAberta] = useState(false)
  const [confirmacaoEntradaAberta, setConfirmacaoEntradaAberta] = useState(false)
  const [confirmacaoAcao, setConfirmacaoAcao] = useState<ConfirmacaoAcao | null>(null)
  const [carregandoCamera, setCarregandoCamera] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [salvandoEntrada, setSalvandoEntrada] = useState(false)
  const [registrandoSaida, setRegistrandoSaida] = useState<string | null>(null)
  const [registrandoReentrada, setRegistrandoReentrada] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const router = useRouter()

  async function carregarDentro() {
    const { data, error } = await supabase
      .from('registros')
      .select('*')
      .is('hora_saida', null)
      .order('hora_entrada', { ascending: false })

    if (error) {
      setErro('Nao foi possivel carregar as pessoas dentro.')
      return
    }

    setDentro((data || []) as Registro[])
  }

  async function carregarSaidos(termo = '') {
    let query = supabase
      .from('registros')
      .select('*')
      .not('hora_saida', 'is', null)
      .order('hora_saida', { ascending: false })

    if (termo.trim()) {
      query = query.or(`nome.ilike.%${termo.trim()}%,documento.ilike.%${termo.trim()}%`)
    }

    const { data, error } = await query

    if (error) {
      setErro('Nao foi possivel carregar os visitantes que ja sairam.')
      return
    }

    setSaidos((data || []) as Registro[])
  }

  useEffect(() => {
    const usuarioLogado = lerUsuarioLogado()

    if (!usuarioLogado || usuarioLogado.ativo === false) {
      router.push('/')
      return
    }

    async function iniciar() {
      setUsuario(usuarioLogado)
      setCarregando(true)
      setErro('')
      await Promise.all([carregarDentro(), carregarSaidos()])
      setCarregando(false)
    }

    iniciar()
  }, [router])

  useEffect(() => {
    return () => {
      if (fotoPreview) {
        URL.revokeObjectURL(fotoPreview)
      }

      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [fotoPreview])

  const ultimaEntrada = useMemo(() => {
    if (!dentro[0]) return '-'
    return formatarData(dentro[0].hora_entrada)
  }, [dentro])

  const idsReentrada = useMemo(() => identificarReentradas([...dentro, ...saidos]), [dentro, saidos])

  const dentroFiltrado = useMemo(() => {
    const termo = buscaDentro.trim().toLowerCase()

    if (!termo) return []

    return dentro.filter((registro) => {
      const nome = registro.nome.toLowerCase()
      const documento = (registro.documento || '').toLowerCase()
      return nome.includes(termo) || documento.includes(termo)
    })
  }, [buscaDentro, dentro])

  const dentroVisivel = useMemo(() => dentroFiltrado, [dentroFiltrado])

  const hospedesDentroFiltrados = useMemo(() => {
    const termo = buscaHospedesDentro.trim().toLowerCase()

    if (!termo) return []

    return dentro.filter((registro) => {
      const nome = registro.nome.toLowerCase()
      const documento = (registro.documento || '').toLowerCase()
      return nome.includes(termo) || documento.includes(termo)
    })
  }, [buscaHospedesDentro, dentro])

  const saidosFiltrados = useMemo(() => {
    const termo = buscaSaidos.trim().toLowerCase()

    if (!termo) return []

    const hoje = new Date()
    const pessoasDentro = new Set(dentro.map((registro) => chaveRegistro(registro)))
    const ultimoRegistroPorPessoa = new Map<string, Registro>()

    saidos.forEach((registro) => {
      if (!registro.hora_saida || !ehMesmoDia(registro.hora_saida, hoje)) {
        return
      }

      const chave = chaveRegistro(registro)

      if (pessoasDentro.has(chave)) {
        return
      }

      const atual = ultimoRegistroPorPessoa.get(chave)

      if (!atual) {
        ultimoRegistroPorPessoa.set(chave, registro)
        return
      }

      const horaAtual = new Date(atual.hora_saida || atual.hora_entrada).getTime()
      const horaNova = new Date(registro.hora_saida || registro.hora_entrada).getTime()

      if (horaNova > horaAtual) {
        ultimoRegistroPorPessoa.set(chave, registro)
      }
    })

    return Array.from(ultimoRegistroPorPessoa.values()).filter((registro) => {
      const nome = registro.nome.toLowerCase()
      const documento = (registro.documento || '').toLowerCase()
      return nome.includes(termo) || documento.includes(termo)
    })
  }, [buscaSaidos, dentro, saidos])

  const consultaRegistrosFiltrados = useMemo(() => {
    if (!consultaRegistros.length) return []

    if (consultaFiltro === 'todos') {
      return consultaRegistros
    }

    if (consultaFiltro === 'dentro') {
      return consultaRegistros.filter((registro) => !registro.hora_saida)
    }

    if (consultaFiltro === 'saida') {
      return consultaRegistros.filter((registro) => Boolean(registro.hora_saida))
    }

    return consultaRegistros.filter((registro) => idsReentrada.has(registro.id))
  }, [consultaFiltro, consultaRegistros, idsReentrada])

  const resumoConsulta = useMemo(() => {
    if (!consultaExecutada) return ''

    if (!consultaRegistrosFiltrados.length) {
      return 'Nenhum registro encontrado para os filtros aplicados.'
    }

    const total = consultaRegistrosFiltrados.length
    const sufixo = total === 1 ? 'registro encontrado' : 'registros encontrados'
    const filtro =
      consultaFiltro === 'todos'
        ? 'em todos os status'
        : consultaFiltro === 'dentro'
          ? 'somente para pessoas dentro'
          : consultaFiltro === 'reentrada'
            ? 'somente para reentradas'
            : 'somente para saidas'

    return `${total} ${sufixo} ${filtro}.`
  }, [consultaExecutada, consultaFiltro, consultaRegistrosFiltrados])

  function alterarCampo(campo: keyof FormularioEntrada, valor: string) {
    const proximoValor =
      campo === 'nome'
        ? limparNome(valor)
        : campo === 'documento' || campo === 'telefone'
          ? limparNumero(valor)
          : valor

    setForm((atual) => ({ ...atual, [campo]: proximoValor }))
  }

  function limparFoto() {
    if (fotoPreview) {
      URL.revokeObjectURL(fotoPreview)
    }

    setFoto(null)
    setFotoPreview('')
  }

  function fecharCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraAberta(false)
  }

  function alterarFoto(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0] || null
    setErro('')

    if (!arquivo) {
      limparFoto()
      return
    }

    if (!arquivo.type.startsWith('image/')) {
      limparFoto()
      setErro('Selecione um arquivo de imagem.')
      return
    }

    if (arquivo.size > TAMANHO_MAXIMO_FOTO) {
      limparFoto()
      setErro('A foto deve ter no maximo 5 MB.')
      return
    }

    if (fotoPreview) {
      URL.revokeObjectURL(fotoPreview)
    }

    setFoto(arquivo)
    setFotoPreview(URL.createObjectURL(arquivo))
  }

  async function abrirCamera() {
    setErro('')
    setCarregandoCamera(true)

    try {
      streamRef.current?.getTracks().forEach((track) => track.stop())

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      streamRef.current = stream
      setCameraAberta(true)

      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play()
        }
      })
    } catch {
      setErro('Nao foi possivel abrir a camera do computador.')
    } finally {
      setCarregandoCamera(false)
    }
  }

  async function capturarDaCamera() {
    const video = videoRef.current

    if (!video) {
      setErro('A camera nao esta pronta para captura.')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const context = canvas.getContext('2d')

    if (!context) {
      setErro('Nao foi possivel processar a imagem da camera.')
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.9)
    })

    if (!blob) {
      setErro('Nao foi possivel capturar a foto da camera.')
      return
    }

    if (fotoPreview) {
      URL.revokeObjectURL(fotoPreview)
    }

    const arquivo = new File([blob], `camera-${Date.now()}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })

    setFoto(arquivo)
    setFotoPreview(URL.createObjectURL(arquivo))
    fecharCamera()
  }

  function validarEntrada() {
    setErro('')

    if (!form.nome.trim()) {
      setErro('Informe um nome valido usando apenas letras.')
      return false
    }

    if (!form.documento.trim()) {
      setErro('Documento e obrigatorio e deve conter apenas numeros.')
      return false
    }

    if (form.entradaEvento && !form.eventoNome.trim()) {
      setErro('Informe o nome do evento para continuar.')
      return false
    }

    return true
  }

  function solicitarConfirmacaoEntrada(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!validarEntrada()) {
      return
    }

    setConfirmacaoEntradaAberta(true)
  }

  async function confirmarEntrada() {
    if (!validarEntrada()) {
      setConfirmacaoEntradaAberta(false)
      return
    }

    setSalvandoEntrada(true)

    try {
      const fotoUrl = foto ? await enviarFoto(foto) : null

      if (fotoUrl) {
        await registrarLog({
          acao: 'foto_enviada',
          detalhes: `Foto anexada ao visitante ${form.nome.trim()}.`,
          usuarioEmail: usuario?.email,
          usuarioNome: usuario?.nome,
        })
      }

      const novoRegistro = {
        nome: form.nome.trim(),
        documento: form.documento.trim(),
        telefone: form.telefone.trim(),
        empresa: form.empresa.trim(),
        servico: form.servico.trim(),
        destino: form.destino.trim(),
        responsavel: form.responsavel.trim(),
        entrada_evento: form.entradaEvento,
        evento_nome: form.entradaEvento ? form.eventoNome.trim() : null,
        itens_entrada: form.entradaEvento ? form.itensEntrada.trim() : null,
        hora_entrada: new Date().toISOString(),
        ...(fotoUrl ? { foto_url: fotoUrl } : {}),
      }

      const { error } = await supabase.from('registros').insert(novoRegistro)

      if (error) {
        throw new Error('Nao foi possivel registrar a entrada.')
      }

      await registrarLog({
        acao: 'entrada_registrada',
        detalhes: `Entrada registrada para ${form.nome.trim()}.`,
        usuarioEmail: usuario?.email,
        usuarioNome: usuario?.nome,
      })

      setForm(formularioInicial)
      limparFoto()
      setConfirmacaoEntradaAberta(false)
      await Promise.all([carregarDentro(), carregarSaidos(buscaSaidos)])
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Nao foi possivel registrar a entrada.')
    } finally {
      setSalvandoEntrada(false)
    }
  }

  async function executarSaida(id: string, nome: string) {
    setErro('')
    setRegistrandoSaida(id)

    const { error } = await supabase
      .from('registros')
      .update({ hora_saida: new Date().toISOString() })
      .eq('id', id)

    setRegistrandoSaida(null)

    if (error) {
      setErro('Nao foi possivel registrar a saida.')
      return
    }

    await registrarLog({
      acao: 'saida_registrada',
      detalhes: `Saida registrada para ${nome}.`,
      usuarioEmail: usuario?.email,
      usuarioNome: usuario?.nome,
    })

    await Promise.all([carregarDentro(), carregarSaidos(buscaSaidos)])
  }

  async function executarReentrada(registro: Registro) {
    setErro('')
    setRegistrandoReentrada(registro.id)

    const novoRegistro = {
      nome: registro.nome,
      documento: registro.documento || '',
      telefone: registro.telefone || '',
      empresa: registro.empresa || '',
      servico: registro.servico || '',
      destino: registro.destino || '',
      responsavel: registro.responsavel || '',
      hora_entrada: new Date().toISOString(),
      ...(registro.foto_url ? { foto_url: registro.foto_url } : {}),
    }

    const { error } = await supabase.from('registros').insert(novoRegistro)

    setRegistrandoReentrada(null)

    if (error) {
      setErro('Nao foi possivel registrar a reentrada.')
      return
    }

    await registrarLog({
      acao: 'reentrada_registrada',
      detalhes: `Reentrada registrada para ${registro.nome}.`,
      usuarioEmail: usuario?.email,
      usuarioNome: usuario?.nome,
    })

    await Promise.all([carregarDentro(), carregarSaidos(buscaSaidos)])
  }

  async function confirmarAcaoPendente() {
    if (!confirmacaoAcao) return

    if (confirmacaoAcao.tipo === 'saida') {
      await executarSaida(confirmacaoAcao.registro.id, confirmacaoAcao.registro.nome)
    }

    if (confirmacaoAcao.tipo === 'reentrada') {
      await executarReentrada(confirmacaoAcao.registro)
    }

    setConfirmacaoAcao(null)
  }

  async function atualizarLista() {
    setCarregando(true)
    setErro('')
    await Promise.all([carregarDentro(), carregarSaidos(buscaSaidos)])
    setCarregando(false)
  }

  async function consultarRegistros(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    setErro('')

    if (!consultaDataInicio && !consultaDataFim && !consultaPesquisa.trim()) {
      setConsultaExecutada(false)
      setConsultaRegistros([])
      return
    }

    let query = supabase.from('registros').select('*').order('hora_entrada', { ascending: false })

    if (consultaDataInicio) {
      query = query.gte('hora_entrada', `${consultaDataInicio}T00:00:00`)
    }

    if (consultaDataFim) {
      query = query.lte('hora_entrada', `${consultaDataFim}T23:59:59`)
    }

    if (consultaPesquisa.trim()) {
      const termo = consultaPesquisa.trim()
      query = query.or(`nome.ilike.%${termo}%,documento.ilike.%${termo}%`)
    }

    const { data, error } = await query

    if (error) {
      setErro('Nao foi possivel consultar os registros.')
      return
    }

    setConsultaExecutada(true)
    setConsultaRegistros((data || []) as Registro[])
  }

  function limparConsulta() {
    setConsultaExecutada(false)
    setConsultaDataInicio('')
    setConsultaDataFim('')
    setConsultaPesquisa('')
    setConsultaFiltro('todos')
    setConsultaRegistros([])
  }

  function handleLogout() {
    limparSessaoUsuario()
    router.push('/')
  }

  if (carregando && !usuario) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#fbf7f8] px-6 text-[#2b1420]">
        <div className="rounded-lg border border-[#eadde3] bg-white px-6 py-5 shadow-sm">
          Carregando portaria...
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
              <BrandMark compact label="Portaria" title="Controle de Entrada" />
              <p className="max-w-2xl text-sm text-[#6f4358]">
                Fluxo operacional para registro, consulta rapida e saida de visitantes.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-md border border-[#eadde3] bg-[#fffafb] px-3 py-2 text-sm font-medium text-[#6f4358]">
                {usuario?.nome || 'Operador'}
              </div>
              {usuario?.perfil === 'admin' && (
                <button
                  type="button"
                  onClick={() => router.push('/admin')}
                  className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
                >
                  Painel admin
                </button>
              )}
              <button
                type="button"
                onClick={atualizarLista}
                disabled={carregando}
                className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6] disabled:text-[#c08aa3]"
              >
                Atualizar
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
          <div className="rounded-xl border border-[#eadde3] bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-[#8a2d55]">Dentro agora</p>
            <p className="mt-3 text-3xl font-black text-[#97003f]">{dentro.length}</p>
          </div>
          <div className="rounded-xl border border-[#eadde3] bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-[#8a2d55]">Ultima entrada</p>
            <p className="mt-3 text-xl font-black text-[#97003f]">{ultimaEntrada}</p>
          </div>
          <div className="rounded-xl border border-[#eadde3] bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-[#8a2d55]">Turno</p>
            <p className="mt-3 text-xl font-black text-[#97003f]">
              {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date())}
            </p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
          <form
            onSubmit={solicitarConfirmacaoEntrada}
            className="rounded-xl border border-[#eadde3] bg-white p-4 shadow-sm sm:p-5"
          >
            <div className="mb-5">
              <h2 className="text-lg font-bold">Registrar entrada</h2>
              <p className="mt-1 text-sm text-[#6f4358]">
                Preencha os dados essenciais e registre a entrada com agilidade.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Nome *</span>
                <input
                  value={form.nome}
                  onChange={(event) => alterarCampo('nome', event.target.value)}
                  className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                  autoCapitalize="words"
                  pattern="[A-Za-zÀ-ÿ' -]+"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#4a2636]">
                  Documento *
                </span>
                <input
                  value={form.documento}
                  onChange={(event) => alterarCampo('documento', event.target.value)}
                  className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Telefone</span>
                <input
                  value={form.telefone}
                  onChange={(event) => alterarCampo('telefone', event.target.value)}
                  className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                  inputMode="numeric"
                  pattern="[0-9]*"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Empresa</span>
                <input
                  value={form.empresa}
                  onChange={(event) => alterarCampo('empresa', event.target.value)}
                  className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Servico</span>
                <input
                  value={form.servico}
                  onChange={(event) => alterarCampo('servico', event.target.value)}
                  className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Destino</span>
                <input
                  value={form.destino}
                  onChange={(event) => alterarCampo('destino', event.target.value)}
                  className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#4a2636]">
                  Responsavel
                </span>
                <input
                  value={form.responsavel}
                  onChange={(event) => alterarCampo('responsavel', event.target.value)}
                  className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                />
              </label>

              <div className="block">
                <span className="mb-2 block text-sm font-semibold text-[#4a2636]">
                  Entrada para evento?
                </span>
                <div className="inline-flex rounded-lg border border-[#e5d4dc] bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setForm((atual) => ({ ...atual, entradaEvento: false, eventoNome: '', itensEntrada: '' }))}
                    className={`rounded-md px-4 py-2 text-sm font-bold transition ${
                      !form.entradaEvento
                        ? 'bg-[#97003f] text-white'
                        : 'text-[#6f4358] hover:bg-[#fff0f6]'
                    }`}
                  >
                    Nao
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((atual) => ({ ...atual, entradaEvento: true }))}
                    className={`rounded-md px-4 py-2 text-sm font-bold transition ${
                      form.entradaEvento
                        ? 'bg-[#97003f] text-white'
                        : 'text-[#6f4358] hover:bg-[#fff0f6]'
                    }`}
                  >
                    Sim
                  </button>
                </div>
              </div>

              {form.entradaEvento && (
                <>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[#4a2636]">
                      Nome do evento
                    </span>
                    <input
                      value={form.eventoNome}
                      onChange={(event) =>
                        setForm((atual) => ({ ...atual, eventoNome: event.target.value }))
                      }
                      className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                    />
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-sm font-semibold text-[#4a2636]">
                      Descricao de entrada de itens
                    </span>
                    <textarea
                      value={form.itensEntrada}
                      onChange={(event) =>
                        setForm((atual) => ({ ...atual, itensEntrada: event.target.value }))
                      }
                      rows={3}
                      className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                    />
                  </label>
                </>
              )}

              <div className="sm:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-[#4a2636]">
                  Foto do visitante
                </span>
                <div className="grid gap-3 rounded-lg border border-dashed border-[#d7b8c7] bg-[#fffafb] p-3 sm:grid-cols-[160px_1fr] sm:items-center">
                  <button
                    type="button"
                    onClick={() =>
                      fotoPreview
                        ? setImagemAberta({ alt: 'Foto em pre-visualizacao', src: fotoPreview })
                        : undefined
                    }
                    className="grid aspect-[4/3] place-items-center overflow-hidden rounded-md border border-[#eadde3] bg-white"
                  >
                    {fotoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={fotoPreview}
                        alt="Previa da foto"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="px-3 text-center text-sm font-semibold text-[#8a2d55]">
                        Sem foto
                      </span>
                    )}
                  </button>

                  <div className="flex flex-col gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={alterarFoto}
                      className="w-full rounded-md border border-[#e5d4dc] bg-white px-3 py-2 text-sm text-[#4a2636] file:mr-3 file:rounded-md file:border-0 file:bg-[#97003f] file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
                    />
                    <p className="text-sm text-[#8a2d55]">
                      A imagem sera reduzida antes do envio para economizar espaco.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={abrirCamera}
                        disabled={carregandoCamera}
                        className="rounded-md border border-[#d7b8c7] bg-white px-3 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6] disabled:text-[#c08aa3]"
                      >
                        {carregandoCamera ? 'Abrindo camera...' : 'Usar camera do computador'}
                      </button>
                      {foto && (
                        <button
                          type="button"
                          onClick={limparFoto}
                          className="rounded-md border border-[#d7b8c7] bg-white px-3 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
                        >
                          Remover foto
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {cameraAberta && (
              <div className="hidden" aria-hidden="true" />
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={salvandoEntrada}
                className="rounded-md bg-[#97003f] px-4 py-3 font-bold text-white transition hover:bg-[#7b0034] disabled:bg-[#c08aa3]"
              >
                {salvandoEntrada ? 'Registrando...' : 'Registrar entrada'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(formularioInicial)
                  limparFoto()
                }}
                className="rounded-md border border-[#d7b8c7] bg-white px-4 py-3 font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
              >
                Cancelar
              </button>
            </div>
          </form>

          <div className="grid gap-5">
            <div className="rounded-xl border border-[#eadde3] bg-white shadow-sm">
              <div className="border-b border-[#f0e3e8] px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-bold">Registrar saida</h2>
                    <p className="mt-1 text-sm text-[#6f4358]">
                      Visualizacao rapida dos visitantes ainda ativos na portaria.
                    </p>
                  </div>
                  <input
                    value={buscaDentro}
                    onChange={(event) => setBuscaDentro(event.target.value)}
                    placeholder="Pesquisar nome ou documento"
                    className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da] lg:max-w-xs"
                  />
                </div>
              </div>

              {buscaDentro.trim() ? (
                <div className="divide-y divide-[#f3e8ed]">
                {dentroFiltrado.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-[#8a2d55]">
                    Nenhum visitante encontrado.
                  </p>
                )}

                {dentroVisivel.map((registro) => (
                <div
                  key={registro.id}
                  className="grid gap-4 px-4 py-4 sm:grid-cols-[56px_1fr_auto] sm:items-center"
                >
                  <button
                    type="button"
                    onClick={() =>
                      registro.foto_url
                        ? setImagemAberta({
                            alt: `Foto de ${registro.nome}`,
                            src: registro.foto_url,
                          })
                        : undefined
                    }
                    className="size-14 overflow-hidden rounded-md border border-[#eadde3] bg-[#fffafb]"
                  >
                    {registro.foto_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={registro.foto_url}
                        alt={`Foto de ${registro.nome}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-sm font-black text-[#97003f]">
                        {registro.nome?.charAt(0).toUpperCase() || '?'}
                      </div>
                    )}
                  </button>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words font-bold">{registro.nome}</p>
                      {registro.documento && (
                        <span className="rounded-full bg-[#fff0f6] px-2.5 py-1 text-[11px] font-semibold text-[#8a2d55]">
                          {registro.documento}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 break-words text-sm text-[#6f4358]">
                      {texto(registro.empresa)} · {texto(registro.servico)} · {texto(registro.destino)}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[#8a2d55]">
                      Entrada: {formatarData(registro.hora_entrada)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setConfirmacaoAcao({ tipo: 'saida', registro })}
                    disabled={registrandoSaida === registro.id}
                    className="rounded-md bg-[#97003f] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#7b0034] disabled:bg-[#c08aa3]"
                  >
                    {registrandoSaida === registro.id ? 'Salvando...' : 'Registrar saida'}
                  </button>
                </div>
                ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-[#eadde3] bg-white shadow-sm">
              <div className="border-b border-[#f0e3e8] px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-bold">Registrar Reentrada</h2>
                    <p className="mt-1 text-sm text-[#6f4358]">
                      Consulte quem ja saiu e registre o retorno sem preencher tudo de novo.
                    </p>
                  </div>
                  <input
                    value={buscaSaidos}
                    onChange={(event) => {
                      const valor = event.target.value
                      setBuscaSaidos(valor)
                      void carregarSaidos(valor)
                    }}
                    placeholder="Pesquisar nome ou documento"
                    className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da] lg:max-w-xs"
                  />
                </div>
              </div>

              {buscaSaidos.trim() ? (
                <div className="divide-y divide-[#f3e8ed]">
                {saidosFiltrados.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-[#8a2d55]">
                    Nenhum visitante com saida registrada foi encontrado.
                  </p>
                )}

                {saidosFiltrados.map((registro) => (
                  <div
                    key={`saida-${registro.id}`}
                    className="grid gap-4 px-4 py-4 sm:grid-cols-[56px_1fr_auto] sm:items-center"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        registro.foto_url
                          ? setImagemAberta({
                              alt: `Foto de ${registro.nome}`,
                              src: registro.foto_url,
                            })
                          : undefined
                      }
                      className="size-14 overflow-hidden rounded-md border border-[#eadde3] bg-[#fffafb]"
                    >
                      {registro.foto_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={registro.foto_url}
                          alt={`Foto de ${registro.nome}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-sm font-black text-[#97003f]">
                          {registro.nome?.charAt(0).toUpperCase() || '?'}
                        </div>
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words font-bold">{registro.nome}</p>
                        {registro.documento && (
                          <span className="rounded-full bg-[#fff0f6] px-2.5 py-1 text-[11px] font-semibold text-[#8a2d55]">
                            {registro.documento}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 break-words text-sm text-[#6f4358]">
                        {texto(registro.empresa)} · {texto(registro.servico)} · {texto(registro.destino)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[#8a2d55]">
                        Saida: {formatarData(registro.hora_saida || '')}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setConfirmacaoAcao({ tipo: 'reentrada', registro })}
                      disabled={registrandoReentrada === registro.id}
                      className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6] disabled:text-[#c08aa3]"
                    >
                      {registrandoReentrada === registro.id ? 'Salvando...' : 'Registrar reentrada'}
                    </button>
                  </div>
                ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-[#eadde3] bg-white shadow-sm">
              <div className="border-b border-[#f0e3e8] px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-bold">Pessoas dentro do hotel</h2>
                    <p className="mt-1 text-sm text-[#6f4358]">
                      Consulta rapida por nome ou documento dos visitantes que ainda estao dentro.
                    </p>
                  </div>
                  <input
                    value={buscaHospedesDentro}
                    onChange={(event) => setBuscaHospedesDentro(event.target.value)}
                    placeholder="Pesquisar nome ou documento"
                    className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da] lg:max-w-xs"
                  />
                </div>
              </div>

              {buscaHospedesDentro.trim() ? (
                <div className="divide-y divide-[#f3e8ed]">
                {hospedesDentroFiltrados.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-[#8a2d55]">
                    Nenhum visitante encontrado.
                  </p>
                )}

                {hospedesDentroFiltrados.map((registro) => (
                  <div
                    key={`hospede-${registro.id}`}
                    className="grid gap-4 px-4 py-4 sm:grid-cols-[56px_1fr] sm:items-center"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        registro.foto_url
                          ? setImagemAberta({
                              alt: `Foto de ${registro.nome}`,
                              src: registro.foto_url,
                            })
                          : undefined
                      }
                      className="size-14 overflow-hidden rounded-md border border-[#eadde3] bg-[#fffafb]"
                    >
                      {registro.foto_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={registro.foto_url}
                          alt={`Foto de ${registro.nome}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-sm font-black text-[#97003f]">
                          {registro.nome?.charAt(0).toUpperCase() || '?'}
                        </div>
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words font-bold">{registro.nome}</p>
                        {registro.documento && (
                          <span className="rounded-full bg-[#fff0f6] px-2.5 py-1 text-[11px] font-semibold text-[#8a2d55]">
                            {registro.documento}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 break-words text-sm text-[#6f4358]">
                        {texto(registro.empresa)} · {texto(registro.servico)} · {texto(registro.destino)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[#8a2d55]">
                        Entrada: {formatarData(registro.hora_entrada)}
                      </p>
                    </div>
                  </div>
                ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-xl border border-[#eadde3] bg-white shadow-sm">
            <form
              onSubmit={consultarRegistros}
              className="flex flex-col gap-4 border-b border-[#f0e3e8] px-4 py-4 sm:px-5"
            >
              <div>
                <h2 className="text-lg font-bold">Consultar</h2>
                <p className="mt-1 text-sm text-[#6f4358]">
                  Pesquise registros por periodo, nome, documento e situacao operacional.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-lg bg-[#fffafb] p-3 lg:grid-cols-[180px_180px_minmax(220px,1fr)_auto_auto]">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Data inicial</span>
                  <input
                    type="date"
                    value={consultaDataInicio}
                    onChange={(event) => setConsultaDataInicio(event.target.value)}
                    className="w-full rounded-md border border-[#e5d4dc] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Data final</span>
                  <input
                    type="date"
                    value={consultaDataFim}
                    onChange={(event) => setConsultaDataFim(event.target.value)}
                    className="w-full rounded-md border border-[#e5d4dc] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#4a2636]">
                    Pesquisar nome ou documento
                  </span>
                  <input
                    value={consultaPesquisa}
                    onChange={(event) => setConsultaPesquisa(event.target.value)}
                    placeholder="Ex.: Marcelo ou 123456789"
                    className="w-full rounded-md border border-[#e5d4dc] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                  />
                </label>

                <button
                  type="submit"
                  className="self-end rounded-md bg-[#97003f] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#7b0034]"
                >
                  Consultar
                </button>

                <button
                  type="button"
                  onClick={limparConsulta}
                  className="self-end rounded-md border border-[#d7b8c7] bg-white px-4 py-2.5 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
                >
                  Limpar filtros
                </button>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                {[
                  { id: 'todos', label: 'Todos' },
                  { id: 'dentro', label: 'So dentro' },
                  { id: 'reentrada', label: 'So reentrada' },
                  { id: 'saida', label: 'So saida' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setConsultaFiltro(item.id as FiltroConsulta)}
                    className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                      consultaFiltro === item.id
                        ? 'border border-[#97003f] bg-[#97003f] text-white shadow-sm'
                        : 'border border-[#d7b8c7] bg-white text-[#97003f] hover:bg-[#fff0f6]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
                </div>

                {(consultaDataInicio || consultaDataFim || consultaPesquisa.trim() || consultaFiltro !== 'todos') && (
                  <div className="text-sm font-medium text-[#8a2d55]">
                    Filtros ativos
                  </div>
                )}
              </div>
            </form>

            {resumoConsulta && (
              <div className="border-b border-[#f0e3e8] bg-[#fffafb] px-4 py-3 text-sm font-medium text-[#8a2d55] sm:px-5">
                {resumoConsulta}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead className="bg-[#fff7fa] text-xs font-bold uppercase tracking-[0.08em] text-[#8a2d55]">
                  <tr>
                    <th className="px-4 py-3">Foto</th>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Documento</th>
                    <th className="px-4 py-3">Empresa</th>
                    <th className="px-4 py-3">Servico</th>
                    <th className="px-4 py-3">Destino</th>
                    <th className="px-4 py-3">Entrada</th>
                    <th className="px-4 py-3">Saida</th>
                    <th className="px-4 py-3">Situacao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f3e8ed]">
                  {!consultaExecutada && !consultaDataInicio && !consultaDataFim && !consultaPesquisa.trim() && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-[#8a2d55]">
                        Preencha uma data ou pesquisa para carregar os registros.
                      </td>
                    </tr>
                  )}

                  {consultaExecutada && consultaRegistrosFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-[#8a2d55]">
                        Nenhum registro encontrado para o filtro selecionado.
                      </td>
                    </tr>
                  )}

                  {consultaRegistrosFiltrados.map((registro) => {
                    const situacao = !registro.hora_saida
                      ? 'Dentro'
                      : idsReentrada.has(registro.id)
                        ? 'Reentrada'
                        : 'Saida'

                    return (
                      <tr key={`consulta-${registro.id}`} className="hover:bg-[#fffafb]">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() =>
                              registro.foto_url
                                ? setImagemAberta({
                                    alt: `Foto de ${registro.nome}`,
                                    src: registro.foto_url,
                                  })
                                : undefined
                            }
                            className="size-12 overflow-hidden rounded-md border border-[#eadde3] bg-[#fffafb]"
                          >
                            {registro.foto_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={registro.foto_url}
                                alt={`Foto de ${registro.nome}`}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="grid h-full place-items-center text-sm font-black text-[#97003f]">
                                {registro.nome?.charAt(0).toUpperCase() || '?'}
                              </div>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-semibold">{texto(registro.nome)}</td>
                        <td className="px-4 py-3 text-[#6f4358]">{texto(registro.documento)}</td>
                        <td className="px-4 py-3 text-[#6f4358]">{texto(registro.empresa)}</td>
                        <td className="px-4 py-3 text-[#6f4358]">{texto(registro.servico)}</td>
                        <td className="px-4 py-3 text-[#6f4358]">{texto(registro.destino)}</td>
                        <td className="px-4 py-3 text-[#6f4358]">{formatarData(registro.hora_entrada)}</td>
                        <td className="px-4 py-3 text-[#6f4358]">
                          {registro.hora_saida ? formatarData(registro.hora_saida) : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-[#fff0f6] px-3 py-1 text-xs font-bold text-[#97003f]">
                            {situacao}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
        </section>
      </div>

      {confirmacaoEntradaAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b1420]/70 p-4">
          <div className="w-full max-w-lg rounded-xl border border-[#eadde3] bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-[#2b1420]">Confirmar entrada</h2>
            <p className="mt-2 text-sm text-[#6f4358]">
              Confira os dados antes de registrar a entrada do visitante.
            </p>

            <div className="mt-4 rounded-lg bg-[#fffafb] p-4 text-sm text-[#4a2636]">
              <p><strong>Nome:</strong> {form.nome || '-'}</p>
              <p className="mt-2"><strong>Documento:</strong> {form.documento || '-'}</p>
              <p className="mt-2"><strong>Destino:</strong> {form.destino || '-'}</p>
              <p className="mt-2"><strong>Responsavel:</strong> {form.responsavel || '-'}</p>
              <p className="mt-2"><strong>Entrada para evento:</strong> {form.entradaEvento ? 'Sim' : 'Nao'}</p>
              {form.entradaEvento && (
                <>
                  <p className="mt-2"><strong>Nome do evento:</strong> {form.eventoNome || '-'}</p>
                  <p className="mt-2"><strong>Itens de entrada:</strong> {form.itensEntrada || '-'}</p>
                </>
              )}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmacaoEntradaAberta(false)}
                className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarEntrada}
                disabled={salvandoEntrada}
                className="rounded-md bg-[#97003f] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#7b0034] disabled:bg-[#c08aa3]"
              >
                {salvandoEntrada ? 'Registrando...' : 'Confirmar entrada'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmacaoAcao && (
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
              <p className="mt-2"><strong>Documento:</strong> {confirmacaoAcao.registro.documento || '-'}</p>
              <p className="mt-2"><strong>Empresa:</strong> {confirmacaoAcao.registro.empresa || '-'}</p>
              {confirmacaoAcao.tipo === 'saida' ? (
                <p className="mt-2"><strong>Entrada:</strong> {formatarData(confirmacaoAcao.registro.hora_entrada)}</p>
              ) : (
                <p className="mt-2"><strong>Ultima saida:</strong> {formatarData(confirmacaoAcao.registro.hora_saida || '')}</p>
              )}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmacaoAcao(null)}
                className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarAcaoPendente}
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
      )}

      {cameraAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b1420]/70 p-4">
          <div className="w-full max-w-3xl rounded-lg border border-[#eadde3] bg-white p-4 shadow-xl sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-bold text-[#2b1420]">Camera ativa</p>
                <p className="text-sm text-[#8a2d55]">Posicione o visitante e capture a foto.</p>
              </div>
              <button
                type="button"
                onClick={fecharCamera}
                className="rounded-md border border-[#d7b8c7] bg-white px-3 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
              >
                Fechar
              </button>
            </div>

            <div className="overflow-hidden rounded-lg border border-[#eadde3] bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="aspect-[16/10] w-full object-cover"
              />
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={fecharCamera}
                className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={capturarDaCamera}
                className="rounded-md bg-[#97003f] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#7b0034]"
              >
                Capturar foto
              </button>
            </div>
          </div>
        </div>
      )}

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
