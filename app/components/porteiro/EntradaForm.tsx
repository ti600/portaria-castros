'use client'

import { ChangeEvent, FormEvent, useEffect, useRef } from 'react'
import { formatarCpf, formatarTelefone, texto } from '../../lib/formatters'
import { FormularioEntrada, FormularioEvento } from '../../lib/registros-types'

type EntradaFormProps = {
  form: FormularioEntrada
  eventoForm: FormularioEvento
  foto: File | null
  fotoPreview: string
  eventoListaFotoPreview: string
  formularioLiberado: boolean
  cpfCompletoInvalido: boolean
  avisoAutopreenchimento: string
  erroFormularioEntrada: string
  carregandoCamera: boolean
  salvandoEntrada: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onAlterarCampo: (campo: keyof FormularioEntrada, valor: string) => void
  onAlternarTipoDocumento: () => void
  onMarcarEventoNao: () => void
  onMarcarEventoSim: () => void
  onAbrirFichaEvento: () => void
  onAbrirPreviaFoto: () => void
  onAlterarFoto: (event: ChangeEvent<HTMLInputElement>) => void
  onAbrirCamera: () => void
  onLimparFoto: () => void
  onCancelar: () => void
}

export function EntradaForm({
  form,
  eventoForm,
  foto,
  fotoPreview,
  eventoListaFotoPreview,
  formularioLiberado,
  cpfCompletoInvalido,
  avisoAutopreenchimento,
  erroFormularioEntrada,
  carregandoCamera,
  salvandoEntrada,
  onSubmit,
  onAlterarCampo,
  onAlternarTipoDocumento,
  onMarcarEventoNao,
  onMarcarEventoSim,
  onAbrirFichaEvento,
  onAbrirPreviaFoto,
  onAlterarFoto,
  onAbrirCamera,
  onLimparFoto,
  onCancelar,
}: EntradaFormProps) {
  const erroRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (erroFormularioEntrada) {
      erroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [erroFormularioEntrada])

  const ehCpf = form.tipoDocumento === 'cpf'

  return (
    <form
      onSubmit={onSubmit}
      className="h-full min-h-[420px] rounded-xl border border-[#eadde3] bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="mb-5">
        <h2 className="text-lg font-bold">Registrar entrada</h2>
        <p className="mt-1 text-sm text-[#6f4358]">
          {ehCpf
            ? 'Inicie pelo CPF para localizar o visitante ou abrir um novo cadastro com mais agilidade.'
            : 'Inicie pelo RG para localizar o visitante ou abrir um novo cadastro com mais agilidade.'}
        </p>
      </div>

      <div className="rounded-lg border border-[#eadde3] bg-[#fffafb] p-4">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-[#4a2636]">
            {ehCpf ? 'CPF *' : 'RG *'}
          </span>
          <input
            value={ehCpf ? formatarCpf(form.documento) : form.documento}
            onChange={(event) => onAlterarCampo('documento', event.target.value)}
            className="w-full rounded-md border border-[#e5d4dc] bg-white px-3 py-3 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
            inputMode={ehCpf ? 'numeric' : 'text'}
            placeholder={ehCpf ? '000.000.000-00' : 'Ex.: 12.345.678-9'}
            required
            autoFocus
          />
        </label>

        {formularioLiberado ? (
          <p className="mt-3 text-sm text-[#2a7a3b]">
            {ehCpf ? 'CPF validado.' : 'RG aceito.'} Continue com o registro abaixo.
          </p>
        ) : ehCpf && cpfCompletoInvalido ? (
          <p className="mt-3 text-sm font-medium text-[#97003f]">CPF invalido. Verifique os 11 digitos informados.</p>
        ) : (
          <p className="mt-3 text-sm text-[#6f4358]">
            {ehCpf
              ? 'Digite os 11 digitos do CPF para iniciar o atendimento.'
              : 'Digite ao menos 5 caracteres do RG para iniciar o atendimento.'}
          </p>
        )}

        <button
          type="button"
          onClick={onAlternarTipoDocumento}
          className="mt-3 text-xs font-semibold text-[#97003f] underline underline-offset-2 hover:text-[#7b0034]"
        >
          {ehCpf ? 'Visitante nao tem CPF? Usar RG' : 'Visitante tem CPF? Voltar para CPF'}
        </button>
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
              onChange={(event) => onAlterarCampo('nome', event.target.value)}
              className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
              autoCapitalize="words"
              required
            />
          </label>

          <input type="hidden" value={form.documento} readOnly />

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Telefone *</span>
            <input
              value={formatarTelefone(form.telefone)}
              onChange={(event) => onAlterarCampo('telefone', event.target.value)}
              className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
              inputMode="numeric"
              placeholder="(00) 00000-0000"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Contato de emergencia</span>
            <input
              value={formatarTelefone(form.contatoEmergencia)}
              onChange={(event) => onAlterarCampo('contatoEmergencia', event.target.value)}
              className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
              inputMode="numeric"
              placeholder="(00) 00000-0000"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Empresa</span>
            <input
              value={form.empresa}
              onChange={(event) => onAlterarCampo('empresa', event.target.value)}
              className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Servico *</span>
            <input
              value={form.servico}
              onChange={(event) => onAlterarCampo('servico', event.target.value)}
              className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Destino *</span>
            <input
              value={form.destino}
              onChange={(event) => onAlterarCampo('destino', event.target.value)}
              className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-3 py-2.5 outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Responsavel</span>
            <input
              value={form.responsavel}
              onChange={(event) => onAlterarCampo('responsavel', event.target.value)}
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
                onClick={onMarcarEventoNao}
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
                onClick={onMarcarEventoSim}
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
                    Abra a ficha do evento para preencher os materiais ou anexar a foto da folha ja
                    preenchida.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onAbrirFichaEvento}
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
                  Materiais digitados:{' '}
                  {
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
                onClick={fotoPreview ? onAbrirPreviaFoto : undefined}
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
                  onChange={onAlterarFoto}
                  className="w-full rounded-md border border-[#e5d4dc] bg-white px-3 py-2 text-sm text-[#4a2636] file:mr-3 file:rounded-md file:border-0 file:bg-[#97003f] file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
                />
                <p className="text-sm text-[#8a2d55]">
                  A imagem sera reduzida antes do envio para economizar espaco.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onAbrirCamera}
                    disabled={carregandoCamera}
                    className="rounded-md border border-[#d7b8c7] bg-white px-3 py-2 text-sm font-bold text-[#97003f] transition hover:bg-[#fff0f6] disabled:text-[#c08aa3]"
                  >
                    {carregandoCamera ? 'Abrindo camera...' : 'Usar camera do computador'}
                  </button>
                  {foto && (
                    <button
                      type="button"
                      onClick={onLimparFoto}
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

      <div className="mt-5">
        {erroFormularioEntrada && (
          <div ref={erroRef} className="mb-3 rounded-md border border-[#f1d38a] bg-[#fff7db] px-4 py-3 text-sm font-medium text-[#8a5a00]">
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
              onClick={onCancelar}
              className="rounded-md border border-[#d7b8c7] bg-white px-4 py-3 font-bold text-[#97003f] transition hover:bg-[#fff0f6]"
            >
              Cancelar
            </button>
          </div>
        ) : null}
      </div>
    </form>
  )
}
