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
  foto_url?: string | null
  hora_entrada: string
  hora_saida?: string | null
}

type FormularioEntrada = {
  nome: string
  documento: string
  telefone: string
  empresa: string
  servico: string
  destino: string
  responsavel: string
}

const formularioInicial: FormularioEntrada = {
  nome: '',
  documento: '',
  telefone: '',
  empresa: '',
  servico: '',
  destino: '',
  responsavel: '',
}

const BUCKET_FOTOS = 'registros-fotos'
const TAMANHO_MAXIMO_FOTO = 5 * 1024 * 1024
const LIMITE_VISUAL_DENTRO = 3

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
  const [cameraAberta, setCameraAberta] = useState(false)
  const [carregandoCamera, setCarregandoCamera] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [salvandoEntrada, setSalvandoEntrada] = useState(false)
  const [registrandoSaida, setRegistrandoSaida] = useState<string | null>(null)
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
      await carregarDentro()
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

  const dentroFiltrado = useMemo(() => {
    const termo = buscaDentro.trim().toLowerCase()

    if (!termo) return dentro

    return dentro.filter((registro) => {
      const nome = registro.nome.toLowerCase()
      const documento = (registro.documento || '').toLowerCase()
      return nome.includes(termo) || documento.includes(termo)
    })
  }, [buscaDentro, dentro])

  const dentroVisivel = useMemo(() => {
    if (buscaDentro.trim()) {
      return dentroFiltrado
    }

    return dentroFiltrado.slice(0, LIMITE_VISUAL_DENTRO)
  }, [buscaDentro, dentroFiltrado])

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

  async function registrarEntrada(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')

    if (!form.nome.trim()) {
      setErro('Informe um nome valido usando apenas letras.')
      return
    }

    if (!form.documento.trim()) {
      setErro('Documento e obrigatorio e deve conter apenas numeros.')
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
      await carregarDentro()
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Nao foi possivel registrar a entrada.')
    } finally {
      setSalvandoEntrada(false)
    }
  }

  async function registrarSaida(id: string, nome: string) {
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

    await carregarDentro()
  }

  async function atualizarLista() {
    setCarregando(true)
    setErro('')
    await carregarDentro()
    setCarregando(false)
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
            onSubmit={registrarEntrada}
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

              <label className="block sm:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-[#4a2636]">
                  Responsavel
                </span>
                <input
                  value={form.responsavel}
                  onChange={(event) => alterarCampo('responsavel', event.target.value)}
                  className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                />
              </label>

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
                      capture="environment"
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

            <button
              type="submit"
              disabled={salvandoEntrada}
              className="mt-5 w-full rounded-md bg-[#97003f] px-4 py-3 font-bold text-white transition hover:bg-[#7b0034] disabled:bg-[#c08aa3]"
            >
              {salvandoEntrada ? 'Registrando...' : 'Registrar entrada'}
            </button>
          </form>

          <div className="rounded-xl border border-[#eadde3] bg-white shadow-sm">
            <div className="border-b border-[#f0e3e8] px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold">Pessoas dentro</h2>
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
                    onClick={() => registrarSaida(registro.id, registro.nome)}
                    disabled={registrandoSaida === registro.id}
                    className="rounded-md bg-[#97003f] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#7b0034] disabled:bg-[#c08aa3]"
                  >
                    {registrandoSaida === registro.id ? 'Salvando...' : 'Registrar saida'}
                  </button>
                </div>
              ))}

              {!buscaDentro.trim() && dentroFiltrado.length > LIMITE_VISUAL_DENTRO && (
                <div className="px-4 py-4 text-sm text-[#8a2d55]">
                  Mostrando os 3 mais recentes. Use a pesquisa para localizar outros visitantes ainda dentro.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

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
