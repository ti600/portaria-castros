'use client'

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrandMark } from '../components/BrandMark'
import { ImageLightbox } from '../components/ImageLightbox'
import { lerUsuarioLogado, limparSessaoUsuario } from '../lib/auth'
import { registrarLog } from '../lib/logs'
import { otimizarFoto } from '../lib/photo'
import { exportarRelatorioExcel, exportarRelatorioPdf } from '../lib/reports'
import { identificarReentradasMesmoDia, obterSituacaoRegistro } from '../lib/status'
import { supabase } from '../lib/supabase'

type Perfil = 'admin' | 'porteiro'

type Usuario = {
  id: string
  nome: string
  email: string
  perfil: Perfil
  ativo?: boolean | null
}

type MaterialEvento = {
  id: string
  quantidade: string
  discriminacao: string
  data: string
  quantidadeSaida: string
  observacoes: string
}

type FormularioEvento = {
  nome: string
  osNumero: string
  recebimentoEm: string
  responsavel: string
  fone: string
  materiais: MaterialEvento[]
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
  evento_nome?: string | null
  evento_os_numero?: string | null
  evento_recebimento_em?: string | null
  evento_responsavel?: string | null
  evento_fone?: string | null
  evento_lista_foto_url?: string | null
  evento_materiais?: MaterialEvento[] | null
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
  entradaEvento: '' | 'sim' | 'nao'
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
  entradaEvento: '',
  eventoNome: '',
  itensEntrada: '',
}

function criarMaterialEvento(): MaterialEvento {
  return {
    id: crypto.randomUUID(),
    quantidade: '',
    discriminacao: '',
    data: new Date().toISOString().slice(0, 10),
    quantidadeSaida: '',
    observacoes: '',
  }
}

const formularioEventoInicial: FormularioEvento = {
  nome: '',
  osNumero: '',
  recebimentoEm: '',
  responsavel: '',
  fone: '',
  materiais: [criarMaterialEvento()],
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

function formatarCpf(valor?: string | null) {
  const numeros = limparNumero(valor || '').slice(0, 11)

  return numeros
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

function formatarTelefone(valor?: string | null) {
  const numeros = limparNumero(valor || '').slice(0, 11)

  if (numeros.length <= 2) return numeros
  if (numeros.length <= 7) return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`

  return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`
}

function resumirTexto(valor?: string | null, limite = 20) {
  const textoNormalizado = (valor || '').trim()

  if (textoNormalizado.length <= limite) {
    return textoNormalizado || '-'
  }

  return `${textoNormalizado.slice(0, limite).trimEnd()}...`
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

async function enviarAnexoEvento(arquivo: File) {
  if (arquivo.type === 'application/pdf') {
    const extensao = arquivo.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'pdf'
    const caminho = `entradas/${Date.now()}-${crypto.randomUUID()}.${extensao}`

    const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(caminho, arquivo, {
      cacheControl: '3600',
      contentType: 'application/pdf',
      upsert: false,
    })

    if (error) {
      console.error('Erro Supabase Storage:', error)
      throw new Error(traduzirErroUpload(error.message))
    }

    const { data } = supabase.storage.from(BUCKET_FOTOS).getPublicUrl(caminho)
    return data.publicUrl
  }

  return await enviarFoto(arquivo)
}

function ehPdfArquivo(valor?: string | null) {
  return (valor || '').toLowerCase().includes('.pdf')
}

async function lerArquivoComoDataUrl(arquivo: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Nao foi possivel gerar a pre-visualizacao da imagem.'))
    reader.readAsDataURL(arquivo)
  })
}

function formatarItensEvento(materiais: MaterialEvento[]) {
  return materiais
    .filter(
      (material) =>
        material.quantidade.trim() ||
        material.discriminacao.trim() ||
        material.data.trim() ||
        material.observacoes.trim()
    )
    .map((material) => {
      const partes = [
        material.quantidade.trim() ? `${material.quantidade.trim()}x` : '',
        material.discriminacao.trim(),
        material.data.trim()
          ? `(${new Intl.DateTimeFormat('pt-BR').format(new Date(`${material.data}T00:00:00`))})`
          : '',
        material.observacoes.trim() ? `- ${material.observacoes.trim()}` : '',
      ].filter(Boolean)

      return partes.join(' ')
    })
    .join(' | ')
}

export default function Porteiro() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const eventoListaInputRef = useRef<HTMLInputElement | null>(null)
  const ultimoCpfConsultadoRef = useRef('')
  const acoesEntradaRef = useRef<HTMLDivElement | null>(null)
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [dentro, setDentro] = useState<Registro[]>([])
  const [form, setForm] = useState<FormularioEntrada>(formularioInicial)
  const [eventoForm, setEventoForm] = useState<FormularioEvento>(formularioEventoInicial)
  const [foto, setFoto] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState('')
  const [eventoListaFoto, setEventoListaFoto] = useState<File | null>(null)
  const [eventoListaFotoPreview, setEventoListaFotoPreview] = useState('')
  const [eventoListaFotoNome, setEventoListaFotoNome] = useState('')
  const [eventoListaFotoTipo, setEventoListaFotoTipo] = useState('')
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
  const [consultaSelecionados, setConsultaSelecionados] = useState<string[]>([])
  const [registrosExpandidos, setRegistrosExpandidos] = useState<string[]>([])
  const [saidaEventoMateriais, setSaidaEventoMateriais] = useState<MaterialEvento[]>([])
  const [cameraAberta, setCameraAberta] = useState(false)
  const [cameraDestino, setCameraDestino] = useState<'visitante' | 'listaEvento'>('visitante')
  const [eventoModalAberto, setEventoModalAberto] = useState(false)
  const [confirmacaoEntradaAberta, setConfirmacaoEntradaAberta] = useState(false)
  const [confirmacaoAcao, setConfirmacaoAcao] = useState<ConfirmacaoAcao | null>(null)
  const [carregandoCamera, setCarregandoCamera] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [salvandoEntrada, setSalvandoEntrada] = useState(false)
  const [registrandoSaida, setRegistrandoSaida] = useState<string | null>(null)
  const [registrandoReentrada, setRegistrandoReentrada] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [avisoAutopreenchimento, setAvisoAutopreenchimento] = useState('')
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
    async function iniciar() {
      try {
        const usuarioLogado = await lerUsuarioLogado()

        if (!usuarioLogado || usuarioLogado.ativo === false) {
          router.push('/')
          return
        }

        setUsuario(usuarioLogado)
        setCarregando(true)
        setErro('')
        await Promise.all([carregarDentro(), carregarSaidos()])
        setCarregando(false)
      } catch {
        setErro('Nao foi possivel validar sua sessao. Entre novamente.')
        setCarregando(false)
        router.push('/')
      }
    }

    void iniciar()
  }, [router])

  useEffect(() => {
    return () => {
      if (fotoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(fotoPreview)
      }

      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [fotoPreview])

  const ultimaEntrada = useMemo(() => {
    if (!dentro[0]) return '-'
    return formatarData(dentro[0].hora_entrada)
  }, [dentro])

  const idsReentrada = useMemo(
    () => identificarReentradasMesmoDia([...dentro, ...saidos]),
    [dentro, saidos]
  )

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

  const erroFormularioEntrada = useMemo(() => {
    if (!erro) return ''

    const mensagensFormulario = [
      'Informe um nome valido',
      'CPF obrigatorio',
      'Telefone obrigatorio',
      'Servico e obrigatorio',
      'Destino e obrigatorio',
      'Selecione se a entrada e para evento',
      'Informe o nome do evento',
      'Informe o responsavel do evento',
      'Informe o telefone do evento',
      'Preencha ao menos um material',
      'Toda linha com quantidade precisa',
      'Descreva os itens vinculados ao evento',
    ]

    return mensagensFormulario.some((mensagem) => erro.startsWith(mensagem)) ? erro : ''
  }, [erro])

  const registrosSelecionadosParaExportacao = useMemo(() => {
    const selecionados = consultaRegistrosFiltrados.filter((registro) =>
      consultaSelecionados.includes(registro.id)
    )

    return selecionados.length ? selecionados : consultaRegistrosFiltrados
  }, [consultaRegistrosFiltrados, consultaSelecionados])

  const formularioLiberado = form.documento.trim().length === 11

  function alterarCampo(campo: keyof FormularioEntrada, valor: string) {
    const proximoValor =
      campo === 'nome'
        ? limparNome(valor)
        : campo === 'documento' || campo === 'telefone'
          ? limparNumero(valor)
          : valor

    if (campo === 'documento') {
      setAvisoAutopreenchimento('')
    }

    setForm((atual) => ({ ...atual, [campo]: proximoValor }))
  }

  function limparFoto() {
    if (fotoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(fotoPreview)
    }

    setFoto(null)
    setFotoPreview('')
  }

  const limparListaEvento = useCallback(() => {
    if (eventoListaFotoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(eventoListaFotoPreview)
    }

    setEventoListaFoto(null)
    setEventoListaFotoPreview('')
    setEventoListaFotoNome('')
    setEventoListaFotoTipo('')
  }, [eventoListaFotoPreview])

  const resetarEvento = useCallback((fecharModal = true) => {
    setEventoForm({
      ...formularioEventoInicial,
      materiais: [criarMaterialEvento()],
    })
    limparListaEvento()
    if (fecharModal) {
      setEventoModalAberto(false)
    }
  }, [limparListaEvento])

  const aplicarHistoricoPorCpf = useCallback((registro: Registro, cpf: string) => {
    if (fotoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(fotoPreview)
    }

    setFoto(null)
    setFotoPreview(registro.foto_url || '')
    setForm({
      nome: registro.nome || '',
      documento: cpf,
      telefone: registro.telefone || '',
      empresa: registro.empresa || '',
      servico: '',
      destino: '',
      responsavel: '',
      entradaEvento: '',
      eventoNome: '',
      itensEntrada: '',
    })
    resetarEvento()
    setAvisoAutopreenchimento('Dados encontrados pelo CPF e preenchidos automaticamente, incluindo a foto do ultimo registro.')
  }, [fotoPreview, resetarEvento])

  const buscarHistoricoPorCpf = useCallback(async (cpf: string) => {
    const { data, error } = await supabase
      .from('registros')
      .select('nome, documento, telefone, empresa, servico, destino, responsavel, foto_url, hora_entrada')
      .eq('documento', cpf)
      .order('hora_entrada', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      setErro('Nao foi possivel consultar o historico pelo CPF.')
      return
    }

    if (!data) {
      setAvisoAutopreenchimento('CPF nao encontrado no historico. Continue com o preenchimento manual.')
      return
    }

    aplicarHistoricoPorCpf(data as Registro, cpf)
  }, [aplicarHistoricoPorCpf])

  useEffect(() => {
    const cpf = form.documento.trim()

    if (cpf.length !== 11) {
      ultimoCpfConsultadoRef.current = cpf
      return
    }

    if (ultimoCpfConsultadoRef.current === cpf) {
      return
    }

    ultimoCpfConsultadoRef.current = cpf
    void buscarHistoricoPorCpf(cpf)
  }, [buscarHistoricoPorCpf, form.documento])

  function fecharCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraAberta(false)
    setCameraDestino('visitante')
  }

  function processarArquivoVisitante(arquivo: File | null) {
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

  async function processarArquivoListaEvento(arquivo: File | null) {
    setErro('')

    if (!arquivo) {
      limparListaEvento()
      return
    }

    if (!arquivo.type.startsWith('image/') && arquivo.type !== 'application/pdf') {
      limparListaEvento()
      setErro('Selecione uma imagem ou PDF valido para a lista de materiais.')
      return
    }

    if (arquivo.size > TAMANHO_MAXIMO_FOTO) {
      limparListaEvento()
      setErro('O anexo da lista deve ter no maximo 5 MB.')
      return
    }

    setEventoListaFoto(arquivo)
    setEventoListaFotoNome(arquivo.name)
    setEventoListaFotoTipo(arquivo.type)
    try {
      if (arquivo.type === 'application/pdf') {
        setEventoListaFotoPreview(URL.createObjectURL(arquivo))
      } else {
        setEventoListaFotoPreview(await lerArquivoComoDataUrl(arquivo))
      }
    } catch (error) {
      limparListaEvento()
      setErro(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel gerar a pre-visualizacao da lista do evento.'
      )
    }
  }

  function alterarFoto(event: ChangeEvent<HTMLInputElement>) {
    processarArquivoVisitante(event.target.files?.[0] || null)
  }

  function alterarListaEvento(event: ChangeEvent<HTMLInputElement>) {
    void processarArquivoListaEvento(event.target.files?.[0] || null)
  }

  function alterarCampoEvento(campo: Exclude<keyof FormularioEvento, 'materiais'>, valor: string) {
    const proximoValor = campo === 'fone' ? limparNumero(valor) : valor
    setEventoForm((atual) => ({ ...atual, [campo]: proximoValor }))
  }

  function alterarMaterialEvento(
    materialId: string,
    campo: Exclude<keyof MaterialEvento, 'id'>,
    valor: string
  ) {
    setEventoForm((atual) => ({
      ...atual,
      materiais: atual.materiais.map((material) =>
        material.id === materialId ? { ...material, [campo]: valor } : material
      ),
    }))
  }

  function adicionarMaterialEvento() {
    setEventoForm((atual) => ({
      ...atual,
      materiais: [...atual.materiais, criarMaterialEvento()],
    }))
  }

  function removerMaterialEvento(materialId: string) {
    setEventoForm((atual) => ({
      ...atual,
      materiais:
        atual.materiais.length === 1
          ? [criarMaterialEvento()]
          : atual.materiais.filter((material) => material.id !== materialId),
    }))
  }

  function abrirConfirmacaoSaida(registro: Registro) {
    setSaidaEventoMateriais(
      (registro.evento_materiais || []).map((material, index) => ({
        id: material.id || `material-${index}`,
        quantidade: material.quantidade || '',
        discriminacao: material.discriminacao || '',
        data: material.data || '',
        quantidadeSaida: material.quantidadeSaida || '',
        observacoes: material.observacoes || '',
      }))
    )
    setConfirmacaoAcao({ tipo: 'saida', registro })
  }

  function alterarSaidaMaterial(materialId: string, valor: string) {
    setSaidaEventoMateriais((atual) =>
      atual.map((material) =>
        material.id === materialId ? { ...material, quantidadeSaida: valor } : material
      )
    )
  }

  async function abrirCamera(destino: 'visitante' | 'listaEvento' = 'visitante') {
    setErro('')
    setCarregandoCamera(true)
    setCameraDestino(destino)

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

    const arquivo = new File([blob], `camera-${Date.now()}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })

    if (cameraDestino === 'listaEvento') {
      await processarArquivoListaEvento(arquivo)
    } else {
      processarArquivoVisitante(arquivo)
    }

    fecharCamera()
  }

  function validarEntrada() {
    setErro('')

    const materiaisPreenchidos = eventoForm.materiais.filter(
      (material) =>
        material.quantidade.trim() ||
        material.discriminacao.trim() ||
        material.data.trim() ||
        material.observacoes.trim()
    )

    if (!form.nome.trim()) {
      setErro('Informe um nome valido usando apenas letras.')
      return false
    }

    if (form.documento.trim().length !== 11) {
      setErro('CPF obrigatorio. Informe os 11 digitos para continuar.')
      return false
    }

    if (form.telefone.trim().length !== 11) {
      setErro('Telefone obrigatorio. Informe DDD e os 9 digitos do numero.')
      return false
    }

    if (!form.servico.trim()) {
      setErro('Servico e obrigatorio.')
      return false
    }

    if (!form.destino.trim()) {
      setErro('Destino e obrigatorio.')
      return false
    }

    if (!form.entradaEvento) {
      setErro('Selecione se a entrada e para evento ou nao.')
      return false
    }

    if (form.entradaEvento === 'sim' && !eventoForm.nome.trim()) {
      setErro('Informe o nome do evento para continuar.')
      return false
    }

    if (form.entradaEvento === 'sim' && !eventoListaFoto && !eventoListaFotoPreview) {
      if (!eventoForm.responsavel.trim()) {
        setErro('Informe o responsavel do evento para continuar.')
        return false
      }

      if (eventoForm.fone.trim().length !== 11) {
        setErro('Informe o telefone do evento com DDD e 9 digitos para continuar.')
        return false
      }

      if (
        !materiaisPreenchidos.length ||
        !materiaisPreenchidos.some(
          (material) => material.quantidade.trim() && material.discriminacao.trim()
        )
      ) {
        setErro('Preencha ao menos um material de entrada ou anexe a foto da lista.')
        return false
      }
    }

    if (
      form.entradaEvento === 'sim' &&
      !eventoListaFoto &&
      !eventoListaFotoPreview &&
      materiaisPreenchidos.some(
        (material) =>
          material.quantidade.trim() &&
          !material.discriminacao.trim()
      )
    ) {
      setErro('Toda linha com quantidade precisa ter a discriminacao do material.')
      return false
    }

    return true
  }

  function solicitarConfirmacaoEntrada(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!validarEntrada()) {
      acoesEntradaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
      const [fotoUrl, listaEventoUrl] = await Promise.all([
        foto ? enviarFoto(foto) : Promise.resolve(null),
        form.entradaEvento === 'sim' && eventoListaFoto ? enviarAnexoEvento(eventoListaFoto) : Promise.resolve(null),
      ])
      const fotoHistoricoUrl = !foto && fotoPreview && !fotoPreview.startsWith('blob:') ? fotoPreview : null
      const fotoRegistroUrl = fotoUrl || fotoHistoricoUrl

      const materiaisEvento = eventoForm.materiais.filter(
        (material) =>
          material.quantidade.trim() ||
          material.discriminacao.trim() ||
          material.data.trim() ||
          material.observacoes.trim()
      )
      const itensEventoResumo = form.entradaEvento === 'sim'
        ? listaEventoUrl
          ? materiaisEvento.length
            ? `Lista de materiais anexada por foto. ${formatarItensEvento(materiaisEvento)}`
            : 'Lista de materiais anexada por foto.'
          : formatarItensEvento(materiaisEvento)
        : null

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
        operador_entrada_email: usuario?.email || null,
        operador_entrada_nome: usuario?.nome || null,
        documento: form.documento.trim(),
        telefone: form.telefone.trim(),
        empresa: form.empresa.trim(),
        servico: form.servico.trim(),
        destino: form.destino.trim(),
        responsavel: form.responsavel.trim(),
        entrada_evento: form.entradaEvento === 'sim',
        evento_nome: form.entradaEvento === 'sim' ? eventoForm.nome.trim() : null,
        evento_os_numero: form.entradaEvento === 'sim' ? eventoForm.osNumero.trim() : null,
        evento_recebimento_em: form.entradaEvento === 'sim' ? eventoForm.recebimentoEm.trim() : null,
        evento_responsavel: form.entradaEvento === 'sim' ? eventoForm.responsavel.trim() : null,
        evento_fone: form.entradaEvento === 'sim' ? eventoForm.fone.trim() : null,
        evento_lista_foto_url: form.entradaEvento === 'sim' ? listaEventoUrl : null,
        evento_materiais: form.entradaEvento === 'sim' ? materiaisEvento : null,
        itens_entrada: itensEventoResumo,
        hora_entrada: new Date().toISOString(),
        ...(fotoRegistroUrl ? { foto_url: fotoRegistroUrl } : {}),
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
      setAvisoAutopreenchimento('')
      ultimoCpfConsultadoRef.current = ''
      resetarEvento()
      limparFoto()
      setConfirmacaoEntradaAberta(false)
      await Promise.all([carregarDentro(), carregarSaidos(buscaSaidos)])
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Nao foi possivel registrar a entrada.')
    } finally {
      setSalvandoEntrada(false)
    }
  }

  async function executarSaida(registro: Registro) {
    setErro('')
    setRegistrandoSaida(registro.id)

    const { error } = await supabase
      .from('registros')
      .update({
        hora_saida: new Date().toISOString(),
        ...(registro.entrada_evento ? { evento_materiais: saidaEventoMateriais } : {}),
      })
      .eq('id', registro.id)

    setRegistrandoSaida(null)

    if (error) {
      setErro('Nao foi possivel registrar a saida.')
      return
    }

    await registrarLog({
      acao: 'saida_registrada',
      detalhes: `Saida registrada para ${registro.nome}.`,
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
      operador_entrada_email: usuario?.email || null,
      operador_entrada_nome: usuario?.nome || null,
      documento: registro.documento || '',
      telefone: registro.telefone || '',
      empresa: registro.empresa || '',
      servico: registro.servico || '',
      destino: registro.destino || '',
      responsavel: registro.responsavel || '',
      entrada_evento: registro.entrada_evento ?? false,
      evento_nome: registro.evento_nome || null,
      evento_os_numero: registro.evento_os_numero || null,
      evento_recebimento_em: registro.evento_recebimento_em || null,
      evento_responsavel: registro.evento_responsavel || null,
      evento_fone: registro.evento_fone || null,
      evento_lista_foto_url: registro.evento_lista_foto_url || null,
      evento_materiais: registro.evento_materiais || null,
      itens_entrada: registro.itens_entrada || null,
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
      await executarSaida(confirmacaoAcao.registro)
    }

    if (confirmacaoAcao.tipo === 'reentrada') {
      await executarReentrada(confirmacaoAcao.registro)
    }

    setSaidaEventoMateriais([])
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
    setConsultaSelecionados([])
  }

  function exportarConsultaExcel() {
    if (!consultaRegistrosFiltrados.length) {
      setErro('Consulte os registros antes de exportar o Excel.')
      return
    }

    setErro('')
    exportarRelatorioExcel(registrosSelecionadosParaExportacao)
  }

  async function exportarConsultaPdf() {
    if (!consultaRegistrosFiltrados.length) {
      setErro('Consulte os registros antes de exportar o PDF.')
      return
    }

    setErro('')
    await exportarRelatorioPdf(registrosSelecionadosParaExportacao)
  }

  function limparConsulta() {
    setConsultaExecutada(false)
    setConsultaDataInicio('')
    setConsultaDataFim('')
    setConsultaPesquisa('')
    setConsultaFiltro('todos')
    setConsultaRegistros([])
    setConsultaSelecionados([])
  }

  function toggleConsultaSelecionado(id: string) {
    setConsultaSelecionados((atual) =>
      atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]
    )
  }

  function toggleSelecionarTodosConsulta() {
    const idsVisiveis = consultaRegistrosFiltrados.map((registro) => registro.id)

    setConsultaSelecionados((atual) =>
      idsVisiveis.every((id) => atual.includes(id)) ? [] : idsVisiveis
    )
  }

  function toggleRegistroExpandido(id: string) {
    setRegistrosExpandidos((atual) =>
      atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]
    )
  }

  async function handleLogout() {
    await limparSessaoUsuario()
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

        {erro && !erroFormularioEntrada && (
          <div className="mb-5 rounded-md border border-[#f1d38a] bg-[#fff7db] px-4 py-3 text-sm font-medium text-[#8a5a00]">
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
                Inicie pelo CPF para localizar o visitante ou abrir um novo cadastro com mais agilidade.
              </p>
            </div>

            <div className="rounded-lg border border-[#eadde3] bg-[#fffafb] p-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#4a2636]">
                  CPF *
                </span>
                <input
                  value={formatarCpf(form.documento)}
                  onChange={(event) => alterarCampo('documento', event.target.value)}
                  className="w-full rounded-md border border-[#e5d4dc] bg-white px-3 py-3 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  required
                  autoFocus
                />
              </label>

              <p className="mt-3 text-sm text-[#6f4358]">
                {formularioLiberado
                  ? 'CPF validado. Continue com o registro abaixo.'
                  : 'Digite os 11 digitos do CPF para iniciar o atendimento.'}
              </p>
            </div>

            {avisoAutopreenchimento ? (
              <div className="rounded-md border border-[#d8d1b1] bg-[#fff8da] px-3 py-2 text-sm text-[#7a5b00]">
                {avisoAutopreenchimento}
              </div>
            ) : null}

            {formularioLiberado ? (
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

              <input type="hidden" value={form.documento} readOnly />

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Telefone *</span>
                <input
                  value={formatarTelefone(form.telefone)}
                  onChange={(event) => alterarCampo('telefone', event.target.value)}
                  className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                  inputMode="numeric"
                  placeholder="(00) 00000-0000"
                  required
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
                <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Servico *</span>
                <input
                  value={form.servico}
                  onChange={(event) => alterarCampo('servico', event.target.value)}
                  className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Destino *</span>
                <input
                  value={form.destino}
                  onChange={(event) => alterarCampo('destino', event.target.value)}
                  className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                  required
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
                  Entrada para evento? *
                </span>
                <div className="inline-flex rounded-lg border border-[#e5d4dc] bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setForm((atual) => ({
                        ...atual,
                        entradaEvento: 'nao',
                        eventoNome: '',
                        itensEntrada: '',
                      }))
                      resetarEvento()
                    }}
                    className={`rounded-md px-4 py-2 text-sm font-bold transition ${
                      form.entradaEvento === 'nao'
                        ? 'bg-[#97003f] text-white'
                        : 'text-[#6f4358] hover:bg-[#fff0f6]'
                    }`}
                  >
                    Nao
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((atual) => ({ ...atual, entradaEvento: 'sim' }))
                      setEventoForm((atual) => ({
                        ...atual,
                        nome: atual.nome || form.destino,
                        responsavel: atual.responsavel || form.responsavel,
                        fone: atual.fone || form.telefone,
                      }))
                      setEventoModalAberto(true)
                    }}
                    className={`rounded-md px-4 py-2 text-sm font-bold transition ${
                      form.entradaEvento === 'sim'
                        ? 'bg-[#97003f] text-white'
                        : 'text-[#6f4358] hover:bg-[#fff0f6]'
                    }`}
                  >
                    Sim
                  </button>
                </div>
              </div>

              {form.entradaEvento === 'sim' && (
                <div className="sm:col-span-2 rounded-lg border border-[#eadde3] bg-[#fffafb] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-[#4a2636]">Controle de materiais do evento</p>
                      <p className="mt-1 text-sm text-[#6f4358]">
                        Abra a ficha do evento para preencher os materiais ou anexar a foto da folha ja preenchida.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEventoModalAberto(true)}
                      className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
                    >
                      Abrir ficha do evento
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-white px-3 py-1 text-[#8a2d55]">
                      Evento: {texto(eventoForm.nome)}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-[#8a2d55]">
                      Lista por foto: {eventoListaFotoPreview ? 'Sim' : 'Nao'}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-[#8a2d55]">
                      Materiais digitados: {
                        eventoForm.materiais.filter(
                          (material) => material.quantidade.trim() || material.discriminacao.trim()
                        ).length
                      }
                    </span>
                  </div>
                </div>
              )}

              <div className="sm:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-[#4a2636]">
                  Foto do visitante
                </span>
                <div className="grid gap-3 rounded-lg border border-dashed border-[#d7b8c7] bg-[#fffafb] p-3 sm:grid-cols-[140px_1fr] sm:items-center">
                  <button
                    type="button"
                    onClick={() =>
                      fotoPreview
                        ? setImagemAberta({ alt: 'Foto em pre-visualizacao', src: fotoPreview })
                        : undefined
                    }
                    className="grid min-h-[220px] place-items-center overflow-hidden rounded-md border border-[#eadde3] bg-white sm:aspect-[3/4] sm:min-h-0"
                  >
                    {fotoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={fotoPreview}
                        alt="Previa da foto"
                        className="h-full w-full object-cover object-top bg-white sm:h-full"
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
                        onClick={() => abrirCamera('visitante')}
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
            ) : null}

            {cameraAberta && (
              <div className="hidden" aria-hidden="true" />
            )}

            <div ref={acoesEntradaRef} className="mt-5">
              {erroFormularioEntrada && (
                <div className="mb-3 rounded-md border border-[#f1d38a] bg-[#fff7db] px-4 py-3 text-sm font-medium text-[#8a5a00]">
                  {erroFormularioEntrada}
                </div>
              )}

              {formularioLiberado ? (
                <div className="flex flex-wrap gap-2">
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
                      setAvisoAutopreenchimento('')
                      ultimoCpfConsultadoRef.current = ''
                      limparFoto()
                      setErro('')
                    }}
                    className="rounded-md border border-[#d7b8c7] bg-white px-4 py-3 font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
                  >
                    Cancelar
                  </button>
                </div>
              ) : null}
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
                    placeholder="Pesquisar nome ou CPF"
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
                          {formatarCpf(registro.documento)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 break-words text-sm text-[#6f4358]">
                      {texto(registro.empresa)} · {texto(registro.servico)} · {texto(registro.destino)}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[#8a2d55]">
                      Entrada: {formatarData(registro.hora_entrada)}
                    </p>
                    {registro.entrada_evento && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => toggleRegistroExpandido(registro.id)}
                          className="rounded-md border border-[#d7b8c7] bg-white px-2.5 py-1 text-xs font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
                        >
                          {registrosExpandidos.includes(registro.id) ? '-' : '+'}
                        </button>
                      </div>
                    )}
                    {registro.entrada_evento && registrosExpandidos.includes(registro.id) && (
                      <div className="mt-2 rounded-md bg-[#fffafb] p-3 text-xs text-[#6f4358]">
                        <p><strong>Evento:</strong> {texto(registro.evento_nome)}</p>
                        <p className="mt-1"><strong>OS numero:</strong> {texto(registro.evento_os_numero)}</p>
                        <p className="mt-1"><strong>Recebimento em:</strong> {texto(registro.evento_recebimento_em)}</p>
                        <p className="mt-1"><strong>Responsavel:</strong> {texto(registro.evento_responsavel)}</p>
                        <p className="mt-1"><strong>Fone:</strong> {formatarTelefone(registro.evento_fone) || '-'}</p>
                        <p className="mt-1"><strong>Itens:</strong> {texto(registro.itens_entrada)}</p>
                        {registro.evento_lista_foto_url && (
                          <button
                            type="button"
                            onClick={() =>
                              ehPdfArquivo(registro.evento_lista_foto_url)
                                ? window.open(registro.evento_lista_foto_url || '', '_blank', 'noopener,noreferrer')
                                : setImagemAberta({
                                    alt: `Lista de materiais de ${registro.nome}`,
                                    src: registro.evento_lista_foto_url || '',
                                  })
                            }
                            className="mt-2 rounded-md border border-[#d7b8c7] bg-white px-2.5 py-1 text-xs font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
                          >
                            {ehPdfArquivo(registro.evento_lista_foto_url) ? 'Abrir PDF anexado' : 'Ver lista anexada'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                    <button
                      type="button"
                      onClick={() => abrirConfirmacaoSaida(registro)}
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
                    placeholder="Pesquisar nome ou CPF"
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
                            {formatarCpf(registro.documento)}
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
                      Consulta rapida por nome ou CPF dos visitantes que ainda estao dentro.
                    </p>
                  </div>
                  <input
                    value={buscaHospedesDentro}
                    onChange={(event) => setBuscaHospedesDentro(event.target.value)}
                    placeholder="Pesquisar nome ou CPF"
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
                            {formatarCpf(registro.documento)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 break-words text-sm text-[#6f4358]">
                        {texto(registro.empresa)} · {texto(registro.servico)} · {texto(registro.destino)}
                      </p>
                      {registro.entrada_evento && (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => toggleRegistroExpandido(registro.id)}
                            className="rounded-md border border-[#d7b8c7] bg-white px-2.5 py-1 text-xs font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
                          >
                            {registrosExpandidos.includes(registro.id) ? '-' : '+'}
                          </button>
                        </div>
                      )}
                      <p className="mt-1 text-xs font-semibold text-[#8a2d55]">
                        Entrada: {formatarData(registro.hora_entrada)}
                      </p>
                      {registro.entrada_evento && registrosExpandidos.includes(registro.id) && (
                        <div className="mt-2 rounded-md bg-[#fffafb] p-3 text-xs text-[#6f4358]">
                          <p><strong>Evento:</strong> {texto(registro.evento_nome)}</p>
                          <p className="mt-1"><strong>OS numero:</strong> {texto(registro.evento_os_numero)}</p>
                          <p className="mt-1"><strong>Recebimento em:</strong> {texto(registro.evento_recebimento_em)}</p>
                          <p className="mt-1"><strong>Responsavel:</strong> {texto(registro.evento_responsavel)}</p>
                          <p className="mt-1"><strong>Fone:</strong> {texto(registro.evento_fone)}</p>
                          <p className="mt-1"><strong>Itens:</strong> {texto(registro.itens_entrada)}</p>
                          {registro.evento_lista_foto_url && (
                            <button
                              type="button"
                              onClick={() =>
                                ehPdfArquivo(registro.evento_lista_foto_url)
                                  ? window.open(registro.evento_lista_foto_url || '', '_blank', 'noopener,noreferrer')
                                  : setImagemAberta({
                                      alt: `Lista de materiais de ${registro.nome}`,
                                      src: registro.evento_lista_foto_url || '',
                                    })
                              }
                              className="mt-2 rounded-md border border-[#d7b8c7] bg-white px-2.5 py-1 text-xs font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
                            >
                              {ehPdfArquivo(registro.evento_lista_foto_url) ? 'Abrir PDF anexado' : 'Ver lista anexada'}
                            </button>
                          )}
                        </div>
                      )}
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
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold">Consultar</h2>
                  <p className="mt-1 text-sm text-[#6f4358]">
                    Pesquise registros por periodo, nome, CPF e situacao operacional.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={exportarConsultaExcel}
                    className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
                  >
                    Exportar Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportarConsultaPdf()}
                    className="rounded-md bg-[#97003f] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#7b0034]"
                  >
                    Exportar PDF
                  </button>
                </div>
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
                    Pesquisar nome ou CPF
                  </span>
                  <input
                    value={consultaPesquisa}
                    onChange={(event) => setConsultaPesquisa(event.target.value)}
                    placeholder="Ex.: Marcello ou 123456789"
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
                  { id: 'dentro', label: 'Dentro' },
                  { id: 'reentrada', label: 'Reentrada' },
                  { id: 'saida', label: 'Saida' },
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

              {consultaRegistrosFiltrados.length > 0 && (
                <div className="flex flex-col gap-2 text-sm text-[#8a2d55] sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    {consultaSelecionados.length > 0
                      ? `${consultaSelecionados.length} registro(s) selecionado(s) para exportacao.`
                      : 'Nenhum registro marcado. Se exportar agora, o sistema leva todos os resultados filtrados.'}
                  </div>
                  <button
                    type="button"
                    onClick={toggleSelecionarTodosConsulta}
                    className="self-start rounded-md border border-[#d7b8c7] bg-white px-3 py-2 text-xs font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
                  >
                    {consultaRegistrosFiltrados.every((registro) =>
                      consultaSelecionados.includes(registro.id)
                    )
                      ? 'Desmarcar todos'
                      : 'Selecionar todos'}
                  </button>
                </div>
              )}
            </form>

            {resumoConsulta && (
              <div className="border-b border-[#f0e3e8] bg-[#fffafb] px-4 py-3 text-sm font-medium text-[#8a2d55] sm:px-5">
                {resumoConsulta}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1240px] text-left text-sm">
                <thead className="bg-[#fff7fa] text-xs font-bold uppercase tracking-[0.08em] text-[#8a2d55]">
                  <tr>
                    <th className="px-4 py-3">Sel.</th>
                    <th className="px-4 py-3">Foto</th>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">CPF</th>
                    <th className="px-4 py-3">Empresa</th>
                    <th className="px-4 py-3">Servico</th>
                    <th className="px-4 py-3">Destino</th>
                    <th className="px-4 py-3">Evento / Itens</th>
                    <th className="px-4 py-3">Anexo</th>
                    <th className="px-4 py-3">Entrada</th>
                    <th className="px-4 py-3">Saida</th>
                    <th className="px-4 py-3">Situacao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f3e8ed]">
                  {!consultaExecutada && !consultaDataInicio && !consultaDataFim && !consultaPesquisa.trim() && (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-[#8a2d55]">
                        Preencha uma data ou pesquisa para carregar os registros.
                      </td>
                    </tr>
                  )}

                  {consultaExecutada && consultaRegistrosFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-[#8a2d55]">
                        Nenhum registro encontrado para o filtro selecionado.
                      </td>
                    </tr>
                  )}

                  {consultaRegistrosFiltrados.map((registro) => {
                          const situacao = obterSituacaoRegistro(registro, idsReentrada)

                    return (
                      <tr key={`consulta-${registro.id}`} className="hover:bg-[#fffafb]">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={consultaSelecionados.includes(registro.id)}
                            onChange={() => toggleConsultaSelecionado(registro.id)}
                            className="size-4 rounded border-[#d7b8c7] text-[#97003f] focus:ring-[#f3c7da]"
                          />
                        </td>
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
                        <td className="px-4 py-3 text-[#6f4358]">{formatarCpf(registro.documento) || '-'}</td>
                        <td className="px-4 py-3 text-[#6f4358]">{texto(registro.empresa)}</td>
                        <td className="px-4 py-3 text-[#6f4358]">{texto(registro.servico)}</td>
                        <td className="px-4 py-3 text-[#6f4358]">{texto(registro.destino)}</td>
                        <td className="px-4 py-3 text-[#6f4358]">
                          {registro.entrada_evento ? (
                            <div className="group relative space-y-1">
                              <p className="font-semibold text-[#4a2636]">{texto(registro.evento_nome)}</p>
                              <p className="text-xs leading-5">{resumirTexto(registro.itens_entrada, 20)}</p>
                              <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-[320px] max-w-[42vw] rounded-lg border border-[#e7c8d6] bg-white p-3 text-left shadow-lg group-hover:block">
                                <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#8a2d55]">
                                  Evento
                                </p>
                                <p className="mt-1 text-sm font-semibold text-[#2b1420]">
                                  {texto(registro.evento_nome)}
                                </p>
                                <p className="mt-3 text-xs font-bold uppercase tracking-[0.08em] text-[#8a2d55]">
                                  Itens
                                </p>
                                <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#6f4358]">
                                  {texto(registro.itens_entrada).replace(/\s\|\s/g, '\n')}
                                </p>
                              </div>
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
                                  window.open(registro.evento_lista_foto_url || '', '_blank', 'noopener,noreferrer')
                                }
                                className="rounded-md border border-[#eadde3] bg-[#fffafb] px-3 py-2 text-xs font-bold text-[#97003f]"
                              >
                                PDF
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setImagemAberta({
                                    alt: `Anexo do evento de ${registro.nome}`,
                                    src: registro.evento_lista_foto_url || '',
                                  })
                                }
                                className="size-12 overflow-hidden rounded-md border border-[#eadde3] bg-[#fffafb]"
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
                            <span className="text-[#6f4358]">-</span>
                          )}
                        </td>
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

      {eventoModalAberto && form.entradaEvento === 'sim' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b1420]/70 p-4">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-xl border border-[#eadde3] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#f0e3e8] px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-[#2b1420]">Controle de entrada e saida de materiais</h2>
                <p className="mt-1 text-sm text-[#6f4358]">
                  Preencha a ficha do evento ou anexe a foto da folha ja preenchida.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEventoModalAberto(false)}
                className="rounded-md border border-[#d7b8c7] bg-white px-3 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
              >
                Fechar
              </button>
            </div>

            <div className="max-h-[calc(92vh-84px)] overflow-y-auto px-5 py-5">
              <div className="rounded-lg border border-[#eadde3] bg-[#fffafb] p-4 text-sm text-[#6f4358]">
                Se a empresa ja trouxe a folha preenchida, basta anexar a foto da lista. Sem a foto, o preenchimento da entrada de materiais passa a ser obrigatorio.
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.45fr)_340px]">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <label className="block md:col-span-2">
                      <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Evento *</span>
                      <input
                        value={eventoForm.nome}
                        onChange={(event) => alterarCampoEvento('nome', event.target.value)}
                        className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-[#4a2636]">OS numero</span>
                      <input
                        value={eventoForm.osNumero}
                        onChange={(event) => alterarCampoEvento('osNumero', event.target.value)}
                        className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Recebimento em</span>
                      <input
                        value={eventoForm.recebimentoEm}
                        onChange={(event) => alterarCampoEvento('recebimentoEm', event.target.value)}
                        className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                      />
                    </label>

                    <label className="block md:col-span-1">
                      <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Responsavel *</span>
                      <input
                        value={eventoForm.responsavel}
                        onChange={(event) => alterarCampoEvento('responsavel', event.target.value)}
                        className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                      />
                    </label>

                    <label className="block md:col-span-1">
                      <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Telefone *</span>
                      <input
                        value={formatarTelefone(eventoForm.fone)}
                        onChange={(event) => alterarCampoEvento('fone', event.target.value)}
                        inputMode="numeric"
                        placeholder="(00) 00000-0000"
                        className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                      />
                    </label>
                  </div>

                  <div className="rounded-lg border border-[#eadde3]">
                    <div className="border-b border-[#f0e3e8] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-[#2b1420]">Entrada de material</h3>
                          <p className="mt-1 text-xs text-[#6f4358]">
                            Preencha esta grade quando a empresa nao trouxer a lista pronta.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={adicionarMaterialEvento}
                          className="rounded-md border border-[#d7b8c7] bg-white px-3 py-2 text-xs font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
                        >
                          Adicionar linha
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[820px] text-left text-sm">
                        <thead className="bg-[#fff7fa] text-xs font-bold uppercase tracking-[0.08em] text-[#8a2d55]">
                          <tr>
                            <th className="w-[92px] px-3 py-3">Qtde</th>
                            <th className="px-3 py-3">Discriminacao</th>
                            <th className="w-[170px] px-3 py-3">Data</th>
                            <th className="px-3 py-3">Observacoes</th>
                            <th className="w-[110px] px-3 py-3"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#f3e8ed]">
                          {eventoForm.materiais.map((material) => (
                            <tr key={material.id}>
                              <td className="px-3 py-3">
                                <input
                                  value={material.quantidade}
                                  onChange={(event) =>
                                    alterarMaterialEvento(
                                      material.id,
                                      'quantidade',
                                      limparNumero(event.target.value)
                                    )
                                  }
                                  inputMode="numeric"
                                  placeholder="0"
                                  className="w-20 rounded-md border border-[#e5d4dc] bg-white px-3 py-2 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                                />
                              </td>
                              <td className="px-3 py-3">
                                <input
                                  value={material.discriminacao}
                                  onChange={(event) =>
                                    alterarMaterialEvento(material.id, 'discriminacao', event.target.value)
                                  }
                                  className="w-full rounded-md border border-[#e5d4dc] bg-white px-3 py-2 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                                />
                              </td>
                              <td className="px-3 py-3">
                                <input
                                  type="date"
                                  value={material.data}
                                  onChange={(event) =>
                                    alterarMaterialEvento(material.id, 'data', event.target.value)
                                  }
                                  className="w-[152px] rounded-md border border-[#e5d4dc] bg-white px-3 py-2 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                                />
                              </td>
                              <td className="px-3 py-3">
                                <input
                                  value={material.observacoes}
                                  onChange={(event) =>
                                    alterarMaterialEvento(material.id, 'observacoes', event.target.value)
                                  }
                                  className="w-full rounded-md border border-[#e5d4dc] bg-white px-3 py-2 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                                />
                              </td>
                              <td className="px-3 py-3">
                                <button
                                  type="button"
                                  onClick={() => removerMaterialEvento(material.id)}
                                  className="rounded-md border border-[#d7b8c7] bg-white px-3 py-2 text-xs font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
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

                <div className="rounded-lg border border-[#eadde3] bg-[#fffafb] p-4">
                  <h3 className="text-sm font-bold text-[#2b1420]">Foto da lista preenchida</h3>
                  <p className="mt-1 text-sm text-[#6f4358]">
                    Se a empresa ja chegar com a folha pronta, anexe a imagem aqui e voce nao precisa digitar os materiais.
                  </p>

                    <button
                      type="button"
                      onClick={() =>
                        eventoListaFotoPreview
                          ? eventoListaFotoTipo === 'application/pdf'
                            ? window.open(eventoListaFotoPreview, '_blank', 'noopener,noreferrer')
                            : setImagemAberta({
                                alt: 'Lista de materiais anexada',
                                src: eventoListaFotoPreview,
                              })
                          : undefined
                    }
                    className="mt-4 grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-md border border-[#eadde3] bg-white"
                  >
                    {eventoListaFotoPreview ? (
                      eventoListaFotoTipo === 'application/pdf' ? (
                        <div className="px-4 text-center">
                          <p className="text-sm font-bold text-[#97003f]">PDF anexado</p>
                          <p className="mt-2 text-xs text-[#6f4358] break-words">{eventoListaFotoNome || 'arquivo.pdf'}</p>
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
                      <span className="px-4 text-center text-sm font-semibold text-[#8a2d55]">
                        Nenhuma lista anexada
                      </span>
                    )}
                  </button>

                  <div className="mt-4 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => eventoListaInputRef.current?.click()}
                        className="rounded-md border border-[#d7b8c7] bg-white px-3 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
                      >
                        Anexar arquivo
                      </button>
                      <button
                        type="button"
                        onClick={() => abrirCamera('listaEvento')}
                        disabled={carregandoCamera}
                        className="rounded-md border border-[#d7b8c7] bg-white px-3 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6] disabled:text-[#c08aa3]"
                      >
                        {carregandoCamera && cameraDestino === 'listaEvento' ? 'Abrindo camera...' : 'Usar camera'}
                      </button>
                    </div>
                    <input
                      ref={eventoListaInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={alterarListaEvento}
                      className="hidden"
                    />
                    <p className="text-xs text-[#8a2d55]">
                      Escolha se vai anexar a foto da folha, um PDF ou capturar direto pela webcam. Imagens tambem serao reduzidas antes do envio.
                    </p>
                    {eventoListaFotoPreview && (
                      <button
                        type="button"
                        onClick={limparListaEvento}
                        className="rounded-md border border-[#d7b8c7] bg-white px-3 py-2 text-xs font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
                      >
                        Remover foto da lista
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => resetarEvento(false)}
                  className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
                >
                  Limpar ficha
                </button>
                <button
                  type="button"
                  onClick={() => setEventoModalAberto(false)}
                  className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => setEventoModalAberto(false)}
                  className="rounded-md bg-[#97003f] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#7b0034]"
                >
                  Salvar ficha do evento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmacaoEntradaAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b1420]/70 p-4">
          <div className="w-full max-w-4xl rounded-xl border border-[#eadde3] bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-[#2b1420]">Confirmar entrada</h2>
            <p className="mt-2 text-sm text-[#6f4358]">
              Confira os dados antes de registrar a entrada do visitante.
            </p>

            <div className="mt-4 rounded-lg bg-[#fffafb] p-4 text-sm text-[#4a2636]">
              <p><strong>Nome:</strong> {form.nome || '-'}</p>
              <p className="mt-2"><strong>CPF:</strong> {formatarCpf(form.documento) || '-'}</p>
              <p className="mt-2"><strong>Telefone:</strong> {formatarTelefone(form.telefone) || '-'}</p>
              <p className="mt-2"><strong>Servico:</strong> {form.servico || '-'}</p>
              <p className="mt-2"><strong>Destino:</strong> {form.destino || '-'}</p>
              <p className="mt-2"><strong>Responsavel:</strong> {form.responsavel || '-'}</p>
              <p className="mt-2">
                <strong>Entrada para evento:</strong>{' '}
                {form.entradaEvento === 'sim'
                  ? 'Sim'
                  : form.entradaEvento === 'nao'
                    ? 'Nao'
                    : '-'}
              </p>
              {form.entradaEvento === 'sim' && (
                <>
                  <p className="mt-2"><strong>Nome do evento:</strong> {eventoForm.nome || '-'}</p>
                  <p className="mt-2"><strong>OS numero:</strong> {eventoForm.osNumero || '-'}</p>
                  <p className="mt-2"><strong>Recebimento em:</strong> {eventoForm.recebimentoEm || '-'}</p>
                  <p className="mt-2"><strong>Responsavel do evento:</strong> {eventoForm.responsavel || '-'}</p>
                  <p className="mt-2"><strong>Fone do evento:</strong> {formatarTelefone(eventoForm.fone) || '-'}</p>
                  <p className="mt-2">
                    <strong>Lista por foto:</strong> {eventoListaFotoPreview ? 'Anexada' : 'Nao anexada'}
                  </p>
                  <p className="mt-2">
                    <strong>Itens de entrada:</strong>{' '}
                    {formatarItensEvento(eventoForm.materiais) || 'Nao informado'}
                  </p>
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
                                onChange={(event) => alterarSaidaMaterial(material.id, event.target.value)}
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
                onClick={() => {
                  setSaidaEventoMateriais([])
                  setConfirmacaoAcao(null)
                }}
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
