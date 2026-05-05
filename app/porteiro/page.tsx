'use client'

import { ChangeEvent, FormEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrandMark } from '../components/BrandMark'
import { ImageLightbox } from '../components/ImageLightbox'
import { ConfirmacaoAcaoModal } from '../components/porteiro/ConfirmacaoAcaoModal'
import { EntradaForm } from '../components/porteiro/EntradaForm'
import { EventoModal } from '../components/porteiro/EventoModal'
import { useEventoEntrada } from '../components/porteiro/useEventoEntrada'
import { usePorteiroTela } from '../components/porteiro/usePorteiroTela'
import {
  processarArquivoListaEvento as processarArquivoListaEventoHelper,
  processarArquivoVisitante as processarArquivoVisitanteHelper,
  revogarPreviewTemporario,
} from '../lib/entrada-arquivos'
import { lerUsuarioLogado, limparSessaoUsuario } from '../lib/auth'
import {
  filtrarMateriaisEventoPreenchidos,
  formatarItensEvento,
  montarPayloadEntrada,
  montarResumoItensEntradaEvento,
} from '../lib/entrada-helpers'
import {
  filtrarConsultaRegistros,
  obterDentroFiltrado,
  obterHospedesDentroFiltrados,
  obterRegistrosSelecionadosParaExportacao,
  obterSaidosFiltrados,
  obterUltimaEntrada,
  resumirConsulta,
  resumirTexto,
} from '../lib/porteiro-consulta'
import {
  atualizarQuantidadeSaidaMaterial,
  montarEstadoConfirmacaoSaida,
} from '../lib/porteiro-confirmacao'
import { formatarCpf, formatarData, formatarTelefone, limparNome, limparNumero, texto } from '../lib/formatters'
import { ThemeToggle } from '../components/ThemeToggle'
import { registrarLog } from '../lib/logs'
import { otimizarFoto } from '../lib/photo'
import { validarCPF, sanitizarTexto } from '../lib/validators'
import {
  ConfirmacaoAcao,
  FiltroConsulta,
  FormularioEntrada,
  FormularioEvento,
  MaterialEvento,
  Registro,
  Usuario,
} from '../lib/registros-types'
import {
  buscarHistoricoPorDocumento as buscarHistoricoPorDocumentoService,
  carregarDentro as carregarDentroService,
  carregarSaidos as carregarSaidosService,
  consultarRegistros as consultarRegistrosService,
  registrarReentrada as registrarReentradaService,
  registrarSaida as registrarSaidaService,
} from '../lib/registros'
import { exportarRelatorioExcel, exportarRelatorioPdf } from '../lib/reports'
import { identificarReentradasMesmoDia, obterSituacaoRegistro } from '../lib/status'
import { supabase } from '../lib/supabase'

const formularioInicial: FormularioEntrada = {
  tipoDocumento: 'cpf',
  nome: '',
  documento: '',
  telefone: '',
  contatoEmergencia: '',
  empresa: '',
  servico: '',
  destino: '',
  responsavel: '',
  entradaEvento: '',
  eventoNome: '',
  itensEntrada: '',
}

function formatarDocumento(documento?: string | null, tipoDocumento?: string | null) {
  if (!documento) return ''
  if (tipoDocumento === 'rg') return `RG ${documento}`
  return formatarCpf(documento) || documento
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
  // CORRECAO 2: extensao sempre resultava em 'pdf' independente do nome do arquivo
  if (arquivo.type === 'application/pdf') {
    const caminho = `entradas/${Date.now()}-${crypto.randomUUID()}.pdf`

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

export default function Porteiro() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const eventoListaInputRef = useRef<HTMLInputElement | null>(null)
  const ultimoCpfConsultadoRef = useRef('')
  const acoesEntradaRef = useRef<HTMLDivElement | null>(null)

  // CORRECAO 1: ref para revogar preview sem adicionar fotoPreview como dependencia
  // nos useCallback, evitando re-consultas desnecessarias ao CPF
  const fotoPreviewRef = useRef('')

  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [dentro, setDentro] = useState<Registro[]>([])
  const [form, setForm] = useState<FormularioEntrada>(formularioInicial)
  const [foto, setFoto] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState('')
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
  const [saidaEventoMateriais, setSaidaEventoMateriais] = useState<MaterialEvento[]>([])
  const [cameraAberta, setCameraAberta] = useState(false)
  const [cameraDestino, setCameraDestino] = useState<'visitante' | 'listaEvento'>('visitante')
  const [eventoModalAberto, setEventoModalAberto] = useState(false)
  const [erroEvento, setErroEvento] = useState('')
  const [confirmacaoEntradaAberta, setConfirmacaoEntradaAberta] = useState(false)
  const [confirmacaoAcao, setConfirmacaoAcao] = useState<ConfirmacaoAcao | null>(null)
  const [carregandoCamera, setCarregandoCamera] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [salvandoEntrada, setSalvandoEntrada] = useState(false)
  const [registrandoSaida, setRegistrandoSaida] = useState<string | null>(null)
  const [registrandoReentrada, setRegistrandoReentrada] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [avisoAutopreenchimento, setAvisoAutopreenchimento] = useState('')
  const [tooltip, setTooltip] = useState<{ x: number; y: number; registro: Registro } | null>(null)
  const router = useRouter()
  const {
    imagemAberta,
    setImagemAberta,
    consultaSelecionados,
    setConsultaSelecionados,
    registrosExpandidos,
    toggleConsultaSelecionado,
    toggleSelecionarTodosConsulta,
    toggleRegistroExpandido,
    fecharImagem,
  } = usePorteiroTela()
  const {
    eventoForm,
    setEventoForm,
    eventoListaFoto,
    setEventoListaFoto,
    eventoListaFotoPreview,
    setEventoListaFotoPreview,
    eventoListaFotoNome,
    setEventoListaFotoNome,
    eventoListaFotoTipo,
    setEventoListaFotoTipo,
    alterarCampoEvento,
    alterarMaterialEvento,
    adicionarMaterialEvento,
    removerMaterialEvento,
    limparListaEvento,
    resetarEvento,
  } = useEventoEntrada({
    formularioEventoInicial,
    criarMaterialEvento,
    onFecharModal: () => setEventoModalAberto(false),
  })

  async function carregarDentro() {
    const { data, error } = await carregarDentroService()

    if (error) {
      setErro('Nao foi possivel carregar as pessoas dentro.')
      return
    }

    setDentro((data || []) as Registro[])
  }

  async function carregarSaidos(termo = '') {
    const { data, error } = await carregarSaidosService(termo)

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

  // CORRECAO 3: separar o cleanup da stream da camera do cleanup do preview de foto
  // para nao parar a camera quando o usuario troca de foto
  useEffect(() => {
    return () => {
      revogarPreviewTemporario(fotoPreviewRef.current)
    }
  }, [])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  // Manter a ref sincronizada com o estado
  useEffect(() => {
    fotoPreviewRef.current = fotoPreview
  }, [fotoPreview])

  const ultimaEntrada = useMemo(() => obterUltimaEntrada(dentro, saidos), [dentro, saidos])

  const idsReentrada = useMemo(
    () => identificarReentradasMesmoDia([...dentro, ...saidos]),
    [dentro, saidos]
  )

  const dentroFiltrado = useMemo(() => obterDentroFiltrado(dentro, buscaDentro), [buscaDentro, dentro])

  // CORRECAO 7: removido dentroVisivel que era alias desnecessario de dentroFiltrado

  const hospedesDentroFiltrados = useMemo(
    () => obterHospedesDentroFiltrados(dentro, buscaHospedesDentro),
    [buscaHospedesDentro, dentro]
  )

  const saidosFiltrados = useMemo(
    () => obterSaidosFiltrados(saidos, dentro, buscaSaidos),
    [buscaSaidos, dentro, saidos]
  )

  const consultaRegistrosFiltrados = useMemo(
    () => filtrarConsultaRegistros(consultaRegistros, consultaFiltro, idsReentrada),
    [consultaFiltro, consultaRegistros, idsReentrada]
  )

  const resumoConsulta = useMemo(
    () => resumirConsulta(consultaExecutada, consultaFiltro, consultaRegistrosFiltrados),
    [consultaExecutada, consultaFiltro, consultaRegistrosFiltrados]
  )

  const erroFormularioEntrada = useMemo(() => {
    if (!erro) return ''

    const mensagensFormulario = [
      'Informe um nome valido',
      'CPF invalido',
      'CPF obrigatorio',
      'RG invalido',
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
  }, [erro, form.documento])

  const registrosSelecionadosParaExportacao = useMemo(
    () => obterRegistrosSelecionadosParaExportacao(consultaRegistrosFiltrados, consultaSelecionados),
    [consultaRegistrosFiltrados, consultaSelecionados]
  )

  const formularioLiberado = form.tipoDocumento === 'cpf'
    ? form.documento.trim().length === 11 && validarCPF(form.documento)
    : form.documento.trim().length >= 5
  const cpfCompletoInvalido = form.tipoDocumento === 'cpf' && form.documento.trim().length === 11 && !validarCPF(form.documento)

  function alterarCampo(campo: keyof FormularioEntrada, valor: string) {
    const proximoValor =
      campo === 'nome'
        ? limparNome(valor)
        : campo === 'documento'
          ? form.tipoDocumento === 'cpf'
            ? limparNumero(valor).slice(0, 11)
            : valor.toUpperCase().slice(0, 20)
          : campo === 'telefone' || campo === 'contatoEmergencia'
            ? limparNumero(valor)
            : valor

    if (campo === 'documento') {
      setAvisoAutopreenchimento('')
      if (form.tipoDocumento === 'cpf' && limparNumero(valor).length < 11) {
        setErro('')
      } else if (form.tipoDocumento === 'rg' && valor.length < 5) {
        setErro('')
      }
    }

    setForm((atual) => ({ ...atual, [campo]: proximoValor }))
  }

  function alternarTipoDocumento() {
    const novoTipo = form.tipoDocumento === 'cpf' ? 'rg' : 'cpf'
    revogarPreviewTemporario(fotoPreviewRef.current)
    setFoto(null)
    setFotoPreview('')
    fotoPreviewRef.current = ''
    setForm({ ...formularioInicial, tipoDocumento: novoTipo })
    setAvisoAutopreenchimento('')
    ultimoCpfConsultadoRef.current = ''
    resetarEvento()
    setErro('')
  }

  function limparFoto() {
    revogarPreviewTemporario(fotoPreviewRef.current)

    setFoto(null)
    setFotoPreview('')
    fotoPreviewRef.current = ''
  }

  const limparFormularioPorDocumento = useCallback((doc: string, tipo: 'cpf' | 'rg') => {
    revogarPreviewTemporario(fotoPreviewRef.current)

    setFoto(null)
    setFotoPreview('')
    fotoPreviewRef.current = ''
    setForm({
      ...formularioInicial,
      tipoDocumento: tipo,
      documento: doc,
    })
    resetarEvento()
  }, [resetarEvento])

  const aplicarHistoricoPorDocumento = useCallback((registro: Registro, doc: string, tipo: 'cpf' | 'rg') => {
    revogarPreviewTemporario(fotoPreviewRef.current)

    setFoto(null)
    setFotoPreview(registro.foto_url || '')
    fotoPreviewRef.current = registro.foto_url || ''
    setForm({
      tipoDocumento: tipo,
      nome: registro.nome || '',
      documento: doc,
      telefone: registro.telefone || '',
      contatoEmergencia: registro.contato_emergencia || '',
      empresa: registro.empresa || '',
      servico: '',
      destino: '',
      responsavel: '',
      entradaEvento: '',
      eventoNome: '',
      itensEntrada: '',
    })
    resetarEvento()
    setAvisoAutopreenchimento(`Dados encontrados pelo ${tipo.toUpperCase()} e preenchidos automaticamente, incluindo a foto do ultimo registro.`)
  }, [resetarEvento])

  const buscarHistoricoParaDocumento = useCallback(async (doc: string, tipo: 'cpf' | 'rg') => {
    const { data, error } = await buscarHistoricoPorDocumentoService(doc)

    // Se o usuario digitou mais enquanto a busca estava em andamento, descarta o resultado antigo
    if (ultimoCpfConsultadoRef.current !== doc) return

    if (error) {
      setErro(`Nao foi possivel consultar o historico pelo ${tipo.toUpperCase()}.`)
      return
    }

    if (!data) {
      limparFormularioPorDocumento(doc, tipo)
      setAvisoAutopreenchimento(`${tipo.toUpperCase()} nao encontrado no historico. Continue com o preenchimento manual.`)
      return
    }

    aplicarHistoricoPorDocumento(data as Registro, doc, tipo)
  }, [aplicarHistoricoPorDocumento, limparFormularioPorDocumento])

  useEffect(() => {
    const doc = form.documento.trim()
    const tipo = form.tipoDocumento

    if (tipo === 'cpf') {
      if (doc.length !== 11 || !validarCPF(doc)) {
        setAvisoAutopreenchimento('')
        ultimoCpfConsultadoRef.current = doc
        return
      }
    } else {
      if (doc.length < 5) {
        setAvisoAutopreenchimento('')
        ultimoCpfConsultadoRef.current = doc
        return
      }
    }

    if (ultimoCpfConsultadoRef.current === doc) {
      return
    }

    ultimoCpfConsultadoRef.current = doc
    void buscarHistoricoParaDocumento(doc, tipo)
  }, [buscarHistoricoParaDocumento, form.documento, form.tipoDocumento])

  function fecharCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraAberta(false)
    setCameraDestino('visitante')
  }

  function processarArquivoVisitante(arquivo: File | null) {
    processarArquivoVisitanteHelper({
      arquivo,
      fotoPreview: fotoPreviewRef.current,
      tamanhoMaximoFoto: TAMANHO_MAXIMO_FOTO,
      limparFoto,
      setFoto,
      setFotoPreview,
      setErro,
    })
  }

  async function processarArquivoListaEvento(arquivo: File | null) {
    await processarArquivoListaEventoHelper({
      arquivo,
      tamanhoMaximoFoto: TAMANHO_MAXIMO_FOTO,
      limparListaEvento,
      setEventoListaFoto,
      setEventoListaFotoPreview,
      setEventoListaFotoNome,
      setEventoListaFotoTipo,
      setErro,
    })
  }

  function alterarFoto(event: ChangeEvent<HTMLInputElement>) {
    processarArquivoVisitante(event.target.files?.[0] || null)
  }

  function alterarListaEvento(event: ChangeEvent<HTMLInputElement>) {
    void processarArquivoListaEvento(event.target.files?.[0] || null)
  }

  function abrirConfirmacaoSaida(registro: Registro) {
    const estadoConfirmacao = montarEstadoConfirmacaoSaida(registro)
    setSaidaEventoMateriais(estadoConfirmacao.saidaEventoMateriais)
    setConfirmacaoAcao(estadoConfirmacao.confirmacaoAcao)
  }

  function alterarSaidaMaterial(materialId: string, valor: string) {
    setSaidaEventoMateriais((atual) => atualizarQuantidadeSaidaMaterial(atual, materialId, valor))
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

    const materiaisPreenchidos = filtrarMateriaisEventoPreenchidos(eventoForm.materiais)

    if (!form.nome.trim()) {
      setErro('Informe um nome valido usando apenas letras.')
      return false
    }

    if (form.tipoDocumento === 'cpf') {
      if (form.documento.trim().length !== 11 || !validarCPF(form.documento)) {
        setErro('CPF invalido. Verifique os 11 digitos informados.')
        return false
      }
    } else {
      if (form.documento.trim().length < 5) {
        setErro('RG invalido. Informe ao menos 5 caracteres.')
        return false
      }
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
      setErroEvento('Informe o nome do evento para continuar.')
      setEventoModalAberto(true)
      return false
    }

    if (form.entradaEvento === 'sim' && !eventoListaFoto && !eventoListaFotoPreview) {
      if (!eventoForm.responsavel.trim()) {
        setErroEvento('Informe o responsavel do evento para continuar.')
        setEventoModalAberto(true)
        return false
      }

      if (eventoForm.fone.trim().length !== 11) {
        setErroEvento('Informe o telefone do evento com DDD e 9 digitos para continuar.')
        setEventoModalAberto(true)
        return false
      }

      if (
        !materiaisPreenchidos.length ||
        !materiaisPreenchidos.some(
          (material) => material.quantidade.trim() && material.discriminacao.trim()
        )
      ) {
        setErroEvento('Preencha ao menos um material de entrada ou anexe a foto da lista.')
        setEventoModalAberto(true)
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
      setErroEvento('Toda linha com quantidade precisa ter a discriminacao do material.')
      setEventoModalAberto(true)
      return false
    }

    return true
  }

  function solicitarConfirmacaoEntrada(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!validarEntrada()) return

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

      const materiaisEvento = filtrarMateriaisEventoPreenchidos(eventoForm.materiais)
      const itensEventoResumo = montarResumoItensEntradaEvento(
        form.entradaEvento,
        listaEventoUrl,
        materiaisEvento
      )

      if (fotoUrl) {
        await registrarLog({
          acao: 'foto_enviada',
          detalhes: `Foto anexada ao visitante ${form.nome.trim()}.`,
          usuarioEmail: usuario?.email,
          usuarioNome: usuario?.nome,
        })
      }

      const novoRegistro = montarPayloadEntrada({
        form,
        eventoForm,
        usuario,
        fotoRegistroUrl,
        listaEventoUrl,
        materiaisEvento,
        itensEventoResumo,
        horaEntrada: new Date().toISOString(),
      })

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

    const { error } = await registrarSaidaService({
      registroId: registro.id,
      entradaEvento: registro.entrada_evento,
      saidaEventoMateriais,
    })

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

    const { error } = await registrarReentradaService({
      registro,
      operadorEmail: usuario?.email,
      operadorNome: usuario?.nome,
    })

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

  // CORRECAO 5: removido parametro event? opcional com semantica enganosa.
  // A funcao e sempre chamada via onSubmit, entao o evento sempre existe.
  // Para chamadas programaticas sem evento, criar uma funcao separada se necessario.
  async function consultarRegistros(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')

    if (!consultaDataInicio && !consultaDataFim && !consultaPesquisa.trim()) {
      setConsultaExecutada(false)
      setConsultaRegistros([])
      return
    }

    const { data, error } = await consultarRegistrosService({
      dataInicio: consultaDataInicio,
      dataFim: consultaDataFim,
      pesquisa: consultaPesquisa,
    })

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

  async function handleLogout() {
    await limparSessaoUsuario()
    router.push('/')
  }

  if (carregando && !usuario) {
    return (
      <main className="min-h-screen bg-[#fbf7f8] px-6 py-8 text-[#2b1420]">
        <div className="mx-auto w-full max-w-[1440px]">
          <div className="rounded-xl border border-[#eadde3] bg-white px-5 py-5 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex flex-col gap-3">
                <BrandMark compact label="Portaria" title="Controle de Entrada" />
                <p className="max-w-2xl text-sm text-[#6f4358]">
                  Preparando o ambiente operacional da portaria.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-10 w-28 animate-pulse rounded-md bg-[#f7e5ec]" />
                <div className="h-10 w-24 animate-pulse rounded-md bg-[#f7e5ec]" />
                <div className="h-10 w-20 animate-pulse rounded-md bg-[#f7e5ec]" />
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                key={`loading-card-${item}`}
                className="rounded-xl border border-[#eadde3] bg-white p-4 shadow-sm"
              >
                <div className="h-4 w-24 animate-pulse rounded bg-[#f7e5ec]" />
                <div className="mt-4 h-8 w-28 animate-pulse rounded bg-[#f3d3df]" />
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
            <div className="rounded-xl border border-[#eadde3] bg-white p-5 shadow-sm">
              <div className="h-6 w-40 animate-pulse rounded bg-[#f3d3df]" />
              <div className="mt-2 h-4 w-72 animate-pulse rounded bg-[#f7e5ec]" />

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={`loading-input-${index}`}>
                    <div className="mb-2 h-4 w-24 animate-pulse rounded bg-[#f7e5ec]" />
                    <div className="h-12 animate-pulse rounded-md bg-[#fbf1f5]" />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-5">
              {[1, 2, 3].map((item) => (
                <div
                  key={`loading-side-${item}`}
                  className="rounded-xl border border-[#eadde3] bg-white p-5 shadow-sm"
                >
                  <div className="h-6 w-36 animate-pulse rounded bg-[#f3d3df]" />
                  <div className="mt-2 h-4 w-52 animate-pulse rounded bg-[#f7e5ec]" />
                  <div className="mt-5 h-12 animate-pulse rounded-md bg-[#fbf1f5]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#fbf7f8] text-[#2b1420] dark:bg-[#100a0d] dark:text-[#eddde6]">
      <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-xl border border-[#eadde3] bg-white px-4 py-4 shadow-sm sm:px-5 dark:border-[#3a1f2a] dark:bg-[#1c1014]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex flex-col gap-3">
              <BrandMark compact label="Portaria" title="Controle de Entrada" />
              <p className="max-w-2xl text-sm text-[#6f4358] dark:text-[#b07f97]">
                Fluxo operacional para registro, consulta rapida e saida de visitantes.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-md border border-[#eadde3] bg-[#fffafb] px-3 py-2 text-sm font-medium text-[#6f4358] dark:border-[#3a1f2a] dark:bg-[#180d11] dark:text-[#b07f97]">
                {usuario?.nome || 'Operador'}
              </div>
              {usuario?.perfil === 'admin' && (
                <button
                  type="button"
                  onClick={() => router.push('/admin')}
                  className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6] dark:border-[#4a2a38] dark:bg-[#1c1014] dark:text-[#f07a9e] dark:hover:bg-[#2a1520]"
                >
                  Painel admin
                </button>
              )}
              <ThemeToggle />
              <button
                type="button"
                onClick={atualizarLista}
                disabled={carregando}
                className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6] disabled:text-[#c08aa3] dark:border-[#4a2a38] dark:bg-[#1c1014] dark:text-[#f07a9e] dark:hover:bg-[#2a1520] dark:disabled:text-[#5a3347]"
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
          <div className="mb-5 rounded-md border border-[#f1d38a] bg-[#fff7db] px-4 py-3 text-sm font-medium text-[#8a5a00] dark:border-[#4a3d00] dark:bg-[#1e1a00] dark:text-[#d4b000]">
            {erro}
          </div>
        )}

        <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[#eadde3] bg-white p-4 shadow-sm dark:border-[#3a1f2a] dark:bg-[#1c1014]">
            <p className="text-sm font-semibold text-[#8a2d55] dark:text-[#d47a9e]">Dentro agora</p>
            <p className="mt-3 text-3xl font-black text-[#97003f] dark:text-[#f07a9e]">{dentro.length}</p>
          </div>
          <div className="rounded-xl border border-[#eadde3] bg-white p-4 shadow-sm dark:border-[#3a1f2a] dark:bg-[#1c1014]">
            <p className="text-sm font-semibold text-[#8a2d55] dark:text-[#d47a9e]">Ultima entrada</p>
            <p className="mt-3 text-xl font-black text-[#97003f] dark:text-[#f07a9e]">{ultimaEntrada}</p>
          </div>
          <div className="rounded-xl border border-[#eadde3] bg-white p-4 shadow-sm dark:border-[#3a1f2a] dark:bg-[#1c1014]">
            <p className="text-sm font-semibold text-[#8a2d55] dark:text-[#d47a9e]">Turno</p>
            <p className="mt-3 text-xl font-black text-[#97003f] dark:text-[#f07a9e]">
              {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date())}
            </p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
          <div ref={acoesEntradaRef}>
            <EntradaForm
              form={form}
              eventoForm={eventoForm}
              foto={foto}
              fotoPreview={fotoPreview}
              eventoListaFotoPreview={eventoListaFotoPreview}
              formularioLiberado={formularioLiberado}
              cpfCompletoInvalido={cpfCompletoInvalido}
              avisoAutopreenchimento={avisoAutopreenchimento}
              erroFormularioEntrada={erroFormularioEntrada}
              carregandoCamera={carregandoCamera}
              salvandoEntrada={salvandoEntrada}
              onSubmit={solicitarConfirmacaoEntrada}
              onAlterarCampo={alterarCampo}
              onAlternarTipoDocumento={alternarTipoDocumento}
              onMarcarEventoNao={() => {
                setForm((atual) => ({
                  ...atual,
                  entradaEvento: 'nao',
                  eventoNome: '',
                  itensEntrada: '',
                }))
                resetarEvento()
              }}
              onMarcarEventoSim={() => {
                setForm((atual) => ({ ...atual, entradaEvento: 'sim' }))
                setEventoForm((atual) => ({
                  ...atual,
                  nome: atual.nome || form.destino,
                  responsavel: atual.responsavel || form.responsavel,
                  fone: atual.fone || form.telefone,
                }))
                setEventoModalAberto(true)
              }}
              onAbrirFichaEvento={() => setEventoModalAberto(true)}
              onAbrirPreviaFoto={() =>
                setImagemAberta({ alt: 'Foto em pre-visualizacao', src: fotoPreview })
              }
              onAlterarFoto={alterarFoto}
              onAbrirCamera={() => abrirCamera('visitante')}
              onLimparFoto={limparFoto}
              onCancelar={() => {
                setForm(formularioInicial)
                setAvisoAutopreenchimento('')
                ultimoCpfConsultadoRef.current = ''
                limparFoto()
                setErro('')
              }}
            />
            {cameraAberta && <div className="hidden" aria-hidden="true" />}
          </div>

          <div className="grid gap-5">
            <div className="rounded-xl border border-[#eadde3] bg-white shadow-sm dark:border-[#3a1f2a] dark:bg-[#1c1014]">
              <div className="border-b border-[#f0e3e8] px-4 py-4 sm:px-5 dark:border-[#351a25]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-bold dark:text-[#eddde6]">Registrar saida</h2>
                    <p className="mt-1 text-sm text-[#6f4358] dark:text-[#b07f97]">
                      Visualizacao rapida dos visitantes ainda ativos na portaria.
                    </p>
                  </div>
                  <input
                    value={buscaDentro}
                    onChange={(event) => setBuscaDentro(event.target.value)}
                    placeholder="Pesquisar nome ou documento"
                    className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da] lg:max-w-xs dark:border-[#3d2030] dark:bg-[#180d11] dark:text-[#eddde6] dark:placeholder:text-[#5a3347] dark:focus:border-[#c4005a] dark:focus:ring-[#4a1f35]"
                  />
                </div>
              </div>

              {buscaDentro.trim() ? (
                <div className="divide-y divide-[#f3e8ed] dark:divide-[#2a1020]">
                {dentroFiltrado.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-[#8a2d55] dark:text-[#d47a9e]">
                    Nenhum visitante encontrado.
                  </p>
                )}

                {/* CORRECAO 7: usando dentroFiltrado diretamente, removido alias dentroVisivel */}
                {dentroFiltrado.map((registro) => (
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
                    className="size-14 overflow-hidden rounded-md border border-[#eadde3] bg-[#fffafb] dark:border-[#3a1f2a] dark:bg-[#180d11]"
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

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words font-bold">{registro.nome}</p>
                      {registro.documento && (
                        <span className="rounded-full bg-[#fff0f6] px-2.5 py-1 text-[11px] font-semibold text-[#8a2d55] dark:bg-[#2a0f1a] dark:text-[#d47a9e]">
                          {formatarDocumento(registro.documento, registro.tipo_documento)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 break-words text-sm text-[#6f4358] dark:text-[#b07f97]">
                      {texto(registro.empresa)} · {texto(registro.servico)} · {texto(registro.destino)}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[#8a2d55] dark:text-[#d47a9e]">
                      Entrada: {formatarData(registro.hora_entrada)}
                    </p>
                    {registro.entrada_evento && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => toggleRegistroExpandido(registro.id)}
                          className="rounded-md border border-[#d7b8c7] bg-white px-2.5 py-1 text-xs font-bold text-[#97003f] transition hover:bg-[#fff0f6] dark:border-[#4a2a38] dark:bg-[#1c1014] dark:text-[#f07a9e] dark:hover:bg-[#2a1520]"
                        >
                          {registrosExpandidos.includes(registro.id) ? '-' : '+'}
                        </button>
                      </div>
                    )}
                    {registro.entrada_evento && registrosExpandidos.includes(registro.id) && (
                      <div className="mt-2 rounded-md bg-[#fffafb] p-3 text-xs text-[#6f4358] dark:bg-[#180d11] dark:text-[#b07f97]">
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
                            className="mt-2 rounded-md border border-[#d7b8c7] bg-white px-2.5 py-1 text-xs font-bold text-[#97003f] transition hover:bg-[#fff0f6] dark:border-[#4a2a38] dark:bg-[#1c1014] dark:text-[#f07a9e] dark:hover:bg-[#2a1520]"
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

            <div className="rounded-xl border border-[#eadde3] bg-white shadow-sm dark:border-[#3a1f2a] dark:bg-[#1c1014]">
              <div className="border-b border-[#f0e3e8] px-4 py-4 sm:px-5 dark:border-[#351a25]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-bold dark:text-[#eddde6]">Registrar Reentrada</h2>
                    <p className="mt-1 text-sm text-[#6f4358] dark:text-[#b07f97]">
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
                    className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da] lg:max-w-xs dark:border-[#3d2030] dark:bg-[#180d11] dark:text-[#eddde6] dark:placeholder:text-[#5a3347] dark:focus:border-[#c4005a] dark:focus:ring-[#4a1f35]"
                  />
                </div>
              </div>

              {buscaSaidos.trim() ? (
                <div className="divide-y divide-[#f3e8ed] dark:divide-[#2a1020]">
                {saidosFiltrados.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-[#8a2d55] dark:text-[#d47a9e]">
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
                      className="size-14 overflow-hidden rounded-md border border-[#eadde3] bg-[#fffafb] dark:border-[#3a1f2a] dark:bg-[#180d11]"
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

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words font-bold">{registro.nome}</p>
                        {registro.documento && (
                          <span className="rounded-full bg-[#fff0f6] px-2.5 py-1 text-[11px] font-semibold text-[#8a2d55] dark:bg-[#2a0f1a] dark:text-[#d47a9e]">
                            {formatarDocumento(registro.documento, registro.tipo_documento)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 break-words text-sm text-[#6f4358] dark:text-[#b07f97]">
                        {texto(registro.empresa)} · {texto(registro.servico)} · {texto(registro.destino)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[#8a2d55] dark:text-[#d47a9e]">
                        Saida: {formatarData(registro.hora_saida || '')}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setConfirmacaoAcao({ tipo: 'reentrada', registro })}
                      disabled={registrandoReentrada === registro.id}
                      className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6] disabled:text-[#c08aa3] dark:border-[#4a2a38] dark:bg-[#1c1014] dark:text-[#f07a9e] dark:hover:bg-[#2a1520] dark:disabled:text-[#5a3347]"
                    >
                      {registrandoReentrada === registro.id ? 'Salvando...' : 'Registrar reentrada'}
                    </button>
                  </div>
                ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-[#eadde3] bg-white shadow-sm dark:border-[#3a1f2a] dark:bg-[#1c1014]">
              <div className="border-b border-[#f0e3e8] px-4 py-4 sm:px-5 dark:border-[#351a25]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-bold dark:text-[#eddde6]">Pessoas dentro do hotel</h2>
                    <p className="mt-1 text-sm text-[#6f4358] dark:text-[#b07f97]">
                      Consulta rapida por nome ou CPF dos visitantes que ainda estao dentro.
                    </p>
                  </div>
                  <input
                    value={buscaHospedesDentro}
                    onChange={(event) => setBuscaHospedesDentro(event.target.value)}
                    placeholder="Pesquisar nome ou documento"
                    className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da] lg:max-w-xs dark:border-[#3d2030] dark:bg-[#180d11] dark:text-[#eddde6] dark:placeholder:text-[#5a3347] dark:focus:border-[#c4005a] dark:focus:ring-[#4a1f35]"
                  />
                </div>
              </div>

              {buscaHospedesDentro.trim() ? (
                <div className="divide-y divide-[#f3e8ed] dark:divide-[#2a1020]">
                {hospedesDentroFiltrados.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-[#8a2d55] dark:text-[#d47a9e]">
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
                      className="size-14 overflow-hidden rounded-md border border-[#eadde3] bg-[#fffafb] dark:border-[#3a1f2a] dark:bg-[#180d11]"
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

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words font-bold">{registro.nome}</p>
                        {registro.documento && (
                          <span className="rounded-full bg-[#fff0f6] px-2.5 py-1 text-[11px] font-semibold text-[#8a2d55] dark:bg-[#2a0f1a] dark:text-[#d47a9e]">
                            {formatarDocumento(registro.documento, registro.tipo_documento)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 break-words text-sm text-[#6f4358] dark:text-[#b07f97]">
                        {texto(registro.empresa)} · {texto(registro.servico)} · {texto(registro.destino)}
                      </p>
                      {registro.entrada_evento && (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => toggleRegistroExpandido(registro.id)}
                            className="rounded-md border border-[#d7b8c7] bg-white px-2.5 py-1 text-xs font-bold text-[#97003f] transition hover:bg-[#fff0f6] dark:border-[#4a2a38] dark:bg-[#1c1014] dark:text-[#f07a9e] dark:hover:bg-[#2a1520]"
                          >
                            {registrosExpandidos.includes(registro.id) ? '-' : '+'}
                          </button>
                        </div>
                      )}
                      <p className="mt-1 text-xs font-semibold text-[#8a2d55] dark:text-[#d47a9e]">
                        Entrada: {formatarData(registro.hora_entrada)}
                      </p>
                      {registro.entrada_evento && registrosExpandidos.includes(registro.id) && (
                        <div className="mt-2 rounded-md bg-[#fffafb] p-3 text-xs text-[#6f4358] dark:bg-[#180d11] dark:text-[#b07f97]">
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
                              className="mt-2 rounded-md border border-[#d7b8c7] bg-white px-2.5 py-1 text-xs font-bold text-[#97003f] transition hover:bg-[#fff0f6] dark:border-[#4a2a38] dark:bg-[#1c1014] dark:text-[#f07a9e] dark:hover:bg-[#2a1520]"
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

        <section className="mt-5 rounded-xl border border-[#eadde3] bg-white shadow-sm dark:border-[#3a1f2a] dark:bg-[#1c1014]">
            <form
              onSubmit={consultarRegistros}
              className="flex flex-col gap-4 border-b border-[#f0e3e8] px-4 py-4 sm:px-5 dark:border-[#351a25]"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold dark:text-[#eddde6]">Consultar</h2>
                  <p className="mt-1 text-sm text-[#6f4358] dark:text-[#b07f97]">
                    Pesquise registros por periodo, nome, CPF e situacao operacional.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={exportarConsultaExcel}
                    className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6] dark:border-[#4a2a38] dark:bg-[#1c1014] dark:text-[#f07a9e] dark:hover:bg-[#2a1520]"
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

              <div className="grid grid-cols-1 gap-3 rounded-lg bg-[#fffafb] p-3 lg:grid-cols-[180px_180px_minmax(220px,1fr)_auto_auto] dark:bg-[#180d11]">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#4a2636] dark:text-[#c9a0b4]">Data inicial</span>
                  <input
                    type="date"
                    value={consultaDataInicio}
                    onChange={(event) => setConsultaDataInicio(event.target.value)}
                    className="w-full rounded-md border border-[#e5d4dc] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da] dark:border-[#3d2030] dark:bg-[#180d11] dark:text-[#eddde6] dark:[color-scheme:dark] dark:focus:border-[#c4005a] dark:focus:ring-[#4a1f35]"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#4a2636] dark:text-[#c9a0b4]">Data final</span>
                  <input
                    type="date"
                    value={consultaDataFim}
                    onChange={(event) => setConsultaDataFim(event.target.value)}
                    className="w-full rounded-md border border-[#e5d4dc] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da] dark:border-[#3d2030] dark:bg-[#180d11] dark:text-[#eddde6] dark:[color-scheme:dark] dark:focus:border-[#c4005a] dark:focus:ring-[#4a1f35]"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#4a2636] dark:text-[#c9a0b4]">
                    Pesquisar nome ou documento
                  </span>
                  <input
                    value={consultaPesquisa}
                    onChange={(event) => setConsultaPesquisa(event.target.value)}
                    placeholder="Ex.: Marcello ou 123456789"
                    className="w-full rounded-md border border-[#e5d4dc] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da] dark:border-[#3d2030] dark:bg-[#180d11] dark:text-[#eddde6] dark:placeholder:text-[#5a3347] dark:focus:border-[#c4005a] dark:focus:ring-[#4a1f35]"
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
                  className="self-end rounded-md border border-[#d7b8c7] bg-white px-4 py-2.5 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6] dark:border-[#4a2a38] dark:bg-[#1c1014] dark:text-[#f07a9e] dark:hover:bg-[#2a1520]"
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
                        : 'border border-[#d7b8c7] bg-white text-[#97003f] hover:bg-[#fff0f6] dark:border-[#4a2a38] dark:bg-[#1c1014] dark:text-[#f07a9e] dark:hover:bg-[#2a1520]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
                </div>

                {(consultaDataInicio || consultaDataFim || consultaPesquisa.trim() || consultaFiltro !== 'todos') && (
                  <div className="text-sm font-medium text-[#8a2d55] dark:text-[#d47a9e]">
                    Filtros ativos
                  </div>
                )}
              </div>

              {consultaRegistrosFiltrados.length > 0 && (
                <div className="flex flex-col gap-2 text-sm text-[#8a2d55] sm:flex-row sm:items-center sm:justify-between dark:text-[#d47a9e]">
                  <div>
                    {consultaSelecionados.length > 0
                      ? `${consultaSelecionados.length} registro(s) selecionado(s) para exportacao.`
                      : 'Nenhum registro marcado. Se exportar agora, o sistema leva todos os resultados filtrados.'}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      toggleSelecionarTodosConsulta(
                        consultaRegistrosFiltrados.map((registro) => registro.id)
                      )
                    }
                    className="self-start rounded-md border border-[#d7b8c7] bg-white px-3 py-2 text-xs font-bold text-[#97003f] transition hover:bg-[#fff0f6] dark:border-[#4a2a38] dark:bg-[#1c1014] dark:text-[#f07a9e] dark:hover:bg-[#2a1520]"
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
              <div className="border-b border-[#f0e3e8] bg-[#fffafb] px-4 py-3 text-sm font-medium text-[#8a2d55] sm:px-5 dark:border-[#351a25] dark:bg-[#180d11] dark:text-[#d47a9e]">
                {resumoConsulta}
              </div>
            )}

            <div className="overflow-x-auto [overflow-y:visible]">
              <table className="w-full min-w-[1240px] text-left text-sm">
                <thead className="bg-[#fff7fa] text-xs font-bold uppercase tracking-[0.08em] text-[#8a2d55] dark:bg-[#180d11] dark:text-[#d47a9e]">
                  <tr>
                    <th className="px-4 py-3">Sel.</th>
                    <th className="px-4 py-3">Foto</th>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Documento</th>
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
                <tbody className="divide-y divide-[#f3e8ed] dark:divide-[#2a1020]">
                  {!consultaExecutada && !consultaDataInicio && !consultaDataFim && !consultaPesquisa.trim() && (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-[#8a2d55] dark:text-[#d47a9e]">
                        Preencha uma data ou pesquisa para carregar os registros.
                      </td>
                    </tr>
                  )}

                  {consultaExecutada && consultaRegistrosFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-[#8a2d55] dark:text-[#d47a9e]">
                        Nenhum registro encontrado para o filtro selecionado.
                      </td>
                    </tr>
                  )}

                  {consultaRegistrosFiltrados.map((registro) => {
                          const situacao = obterSituacaoRegistro(registro, idsReentrada)

                    return (
                      <tr key={`consulta-${registro.id}`} className="hover:bg-[#fffafb] dark:hover:bg-[#1e0f16]">
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
                            className="size-12 overflow-hidden rounded-md border border-[#eadde3] bg-[#fffafb] dark:border-[#3a1f2a] dark:bg-[#180d11]"
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
                        <td className="px-4 py-3 font-semibold">{texto(registro.nome)}</td>
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
                        <td className="px-4 py-3 text-[#6f4358] dark:text-[#b07f97]">{texto(registro.empresa)}</td>
                        <td className="px-4 py-3 text-[#6f4358] dark:text-[#b07f97]">{texto(registro.servico)}</td>
                        <td className="px-4 py-3 text-[#6f4358] dark:text-[#b07f97]">{texto(registro.destino)}</td>
                        <td className="px-4 py-3 text-[#6f4358] dark:text-[#b07f97]">
                          {registro.entrada_evento ? (
                            <div
                              className="cursor-default space-y-1"
                              onMouseEnter={(e: MouseEvent<HTMLDivElement>) => {
                                const rect = e.currentTarget.getBoundingClientRect()
                                const ALTURA_TOOLTIP = 160
                                const cabeAbaixo = rect.bottom + 8 + ALTURA_TOOLTIP < window.innerHeight
                                const y = cabeAbaixo ? rect.bottom + 8 : rect.top - ALTURA_TOOLTIP - 8
                                setTooltip({ x: rect.left, y, registro })
                              }}
                              onMouseLeave={() => setTooltip(null)}
                            >
                              <p className="font-semibold text-[#4a2636] dark:text-[#c9a0b4]">{texto(registro.evento_nome)}</p>
                              <p className="text-xs leading-5">{resumirTexto(registro.itens_entrada, 20)}</p>
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
                                className="rounded-md border border-[#eadde3] bg-[#fffafb] px-3 py-2 text-xs font-bold text-[#97003f] dark:border-[#3a1f2a] dark:bg-[#180d11] dark:text-[#f07a9e]"
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
                                className="size-12 overflow-hidden rounded-md border border-[#eadde3] bg-[#fffafb] dark:border-[#3a1f2a] dark:bg-[#180d11]"
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
                        <td className="px-4 py-3 text-[#6f4358] dark:text-[#b07f97]">
                          {registro.hora_saida ? formatarData(registro.hora_saida) : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-[#fff0f6] px-3 py-1 text-xs font-bold text-[#97003f] dark:bg-[#2a0f1a] dark:text-[#d47a9e]">
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
        <EventoModal
          eventoForm={eventoForm}
          eventoListaInputRef={eventoListaInputRef}
          eventoListaFotoPreview={eventoListaFotoPreview}
          eventoListaFotoNome={eventoListaFotoNome}
          eventoListaFotoTipo={eventoListaFotoTipo}
          carregandoCamera={carregandoCamera}
          cameraDestino={cameraDestino}
          erroEvento={erroEvento}
          onFechar={() => { setEventoModalAberto(false); setErroEvento('') }}
          onAlterarCampoEvento={alterarCampoEvento}
          onAdicionarMaterialEvento={adicionarMaterialEvento}
          onAlterarMaterialEvento={alterarMaterialEvento}
          onRemoverMaterialEvento={removerMaterialEvento}
          onAbrirPreviaLista={() =>
            eventoListaFotoTipo === 'application/pdf'
              ? window.open(eventoListaFotoPreview, '_blank', 'noopener,noreferrer')
              : setImagemAberta({
                  alt: 'Lista de materiais anexada',
                  src: eventoListaFotoPreview,
                })
          }
          onAbrirSeletorArquivo={() => eventoListaInputRef.current?.click()}
          onAbrirCameraListaEvento={() => abrirCamera('listaEvento')}
          onAlterarListaEvento={alterarListaEvento}
          onLimparListaEvento={limparListaEvento}
          onLimparFicha={() => resetarEvento(false)}
          onSalvarFicha={() => { setEventoModalAberto(false); setErroEvento('') }}
        />
      )}

      {confirmacaoEntradaAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b1420]/70 p-4">
          <div className="w-full max-w-4xl rounded-xl border border-[#eadde3] bg-white p-5 shadow-xl dark:border-[#3a1f2a] dark:bg-[#1c1014]">
            <h2 className="text-lg font-bold text-[#2b1420] dark:text-[#eddde6]">Confirmar entrada</h2>
            <p className="mt-2 text-sm text-[#6f4358] dark:text-[#b07f97]">
              Confira os dados antes de registrar a entrada do visitante.
            </p>

            <div className="mt-4 rounded-lg bg-[#fffafb] p-4 text-sm text-[#4a2636] dark:bg-[#180d11] dark:text-[#c9a0b4]">
              <p><strong>Nome:</strong> {form.nome || '-'}</p>
              <p className="mt-2"><strong>Documento ({form.tipoDocumento.toUpperCase()}):</strong> {formatarDocumento(form.documento, form.tipoDocumento) || '-'}</p>
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
                className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6] dark:border-[#4a2a38] dark:bg-[#1c1014] dark:text-[#f07a9e] dark:hover:bg-[#2a1520]"
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
        <ConfirmacaoAcaoModal
          confirmacaoAcao={confirmacaoAcao}
          saidaEventoMateriais={saidaEventoMateriais}
          registrandoSaida={registrandoSaida}
          registrandoReentrada={registrandoReentrada}
          onAlterarSaidaMaterial={alterarSaidaMaterial}
          onCancelar={() => {
            setSaidaEventoMateriais([])
            setConfirmacaoAcao(null)
          }}
          onConfirmar={confirmarAcaoPendente}
        />
      )}

      {cameraAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b1420]/70 p-4">
          <div className="w-full max-w-3xl rounded-lg border border-[#eadde3] bg-white p-4 shadow-xl sm:p-5 dark:border-[#3a1f2a] dark:bg-[#1c1014]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-bold text-[#2b1420] dark:text-[#eddde6]">Camera ativa</p>
                <p className="text-sm text-[#8a2d55] dark:text-[#d47a9e]">Posicione o visitante e capture a foto.</p>
              </div>
              <button
                type="button"
                onClick={fecharCamera}
                className="rounded-md border border-[#d7b8c7] bg-white px-3 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6] dark:border-[#4a2a38] dark:bg-[#1c1014] dark:text-[#f07a9e] dark:hover:bg-[#2a1520]"
              >
                Fechar
              </button>
            </div>

            <div className="overflow-hidden rounded-lg border border-[#eadde3] bg-black dark:border-[#3a1f2a]">
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
                className="rounded-md border border-[#d7b8c7] bg-white px-4 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6] dark:border-[#4a2a38] dark:bg-[#1c1014] dark:text-[#f07a9e] dark:hover:bg-[#2a1520]"
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
          onClose={fecharImagem}
          src={imagemAberta.src}
        />
      )}

      {/* Tooltip fixo da coluna Evento/Itens — usa position:fixed para nao ser afetado
          pelo overflow-x-auto da tabela e nao causar scroll ao aparecer */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 w-[320px] max-w-[42vw] rounded-lg border border-[#e7c8d6] bg-white p-3 text-left shadow-lg dark:border-[#4a2a38] dark:bg-[#1c1014]"
          style={{ top: tooltip.y, left: Math.min(Math.max(tooltip.x, 8), window.innerWidth - 340) }}
        >
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#8a2d55] dark:text-[#d47a9e]">Evento</p>
          <p className="mt-1 text-sm font-semibold text-[#2b1420] dark:text-[#eddde6]">
            {texto(tooltip.registro.evento_nome)}
          </p>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.08em] text-[#8a2d55] dark:text-[#d47a9e]">Itens</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#6f4358] dark:text-[#b07f97]">
            {texto(tooltip.registro.itens_entrada).replace(/\s\|\s/g, '\n')}
          </p>
        </div>
      )}
    </main>
  )
}