'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrandMark } from './components/BrandMark'
import { carregarPerfilAuth, salvarSessaoUsuario } from './lib/auth'
import { supabase } from './lib/supabase'

type Perfil = 'admin' | 'porteiro'

type Usuario = {
  id: string
  nome: string
  email: string
  perfil: Perfil
  ativo?: boolean | null
}

function EyeIcon({ aberto }: { aberto: boolean }) {
  return aberto ? (
    <svg
      aria-hidden="true"
      className="size-5"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 3l18 18M10.58 10.58a2 2 0 102.83 2.83M9.88 5.09A10.94 10.94 0 0112 4c5.05 0 9.27 3.11 10.5 7.5a11.8 11.8 0 01-2.41 4.19M6.61 6.61A11.84 11.84 0 001.5 11.5a11.82 11.82 0 006.17 6.57A10.94 10.94 0 0012 19c1.74 0 3.39-.41 4.85-1.13"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      className="size-5"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const router = useRouter()

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')
    setCarregando(true)

    const {
      data: authData,
      error,
    } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: senha,
    })

    if (error || !authData.user) {
      setCarregando(false)
      setErro('E-mail ou senha incorretos.')
      return
    }

    let perfil: Usuario | null = null

    try {
      perfil = await carregarPerfilAuth(authData.user)
    } catch {
      await supabase.auth.signOut()
      setCarregando(false)
      setErro('Nao foi possivel carregar o perfil do usuario.')
      return
    }

    setCarregando(false)

    if (!perfil) {
      await supabase.auth.signOut()
      setErro('Seu usuario ainda nao foi vinculado ao sistema. Fale com o administrador.')
      return
    }

    if (perfil.ativo === false) {
      await supabase.auth.signOut()
      setErro('Este usuario esta inativo. Fale com um administrador.')
      return
    }

    salvarSessaoUsuario(perfil)
    router.push(perfil.perfil === 'admin' ? '/admin' : '/porteiro')
  }

  return (
    <main className="min-h-screen bg-[#fbf7f8] text-[#2b1420]">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex items-center justify-center px-6 py-8 sm:px-10 lg:col-start-2 lg:row-start-1 lg:py-10">
          <form
            onSubmit={handleLogin}
            className="w-full max-w-md rounded-lg border border-[#eadde3] bg-white p-6 shadow-sm sm:p-8"
          >
            <div className="mb-8">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8a2d55]">
                Acesso
              </p>
              <h2 className="mt-2 text-3xl font-bold text-[#2b1420]">Entrar no painel</h2>
            </div>

            <div className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#4a2636]">E-mail</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-4 py-3 text-[#2b1420] outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#4a2636]">Senha</span>
                <div className="flex items-stretch overflow-hidden rounded-md border border-[#e5d4dc] bg-[#fffafb] transition focus-within:border-[#97003f] focus-within:ring-4 focus-within:ring-[#f3c7da]">
                  <input
                    type={mostrarSenha ? 'text' : 'password'}
                    value={senha}
                    onChange={(event) => setSenha(event.target.value)}
                    autoComplete="current-password"
                    className="w-full bg-transparent px-4 py-3 text-[#2b1420] outline-none"
                    required
                  />
                  <button
                    type="button"
                    onMouseDown={() => setMostrarSenha(true)}
                    onMouseUp={() => setMostrarSenha(false)}
                    onMouseLeave={() => setMostrarSenha(false)}
                    onTouchStart={() => setMostrarSenha(true)}
                    onTouchEnd={() => setMostrarSenha(false)}
                    onTouchCancel={() => setMostrarSenha(false)}
                    aria-label="Segure para visualizar a senha"
                    className="border-l border-[#eadde3] px-4 text-[#97003f] transition hover:bg-[#fff0f6]"
                  >
                    <EyeIcon aberto={mostrarSenha} />
                  </button>
                </div>
              </label>

              {erro && (
                <div className="rounded-md border border-[#f3b7cc] bg-[#fff0f6] px-4 py-3 text-sm font-medium text-[#97003f]">
                  {erro}
                </div>
              )}

              <p className="text-sm text-[#6f4358]">
                Esqueceu a senha? Entrar em contato com o T.I.
              </p>

              <button
                type="submit"
                disabled={carregando}
                className="w-full rounded-md bg-[#97003f] px-4 py-3 font-bold text-white transition hover:bg-[#7b0034] disabled:bg-[#c08aa3]"
              >
                {carregando ? 'Entrando...' : 'Entrar'}
              </button>
            </div>
          </form>
        </section>

        <section className="flex flex-col justify-between bg-[#97003f] px-6 py-7 text-white sm:px-10 lg:col-start-1 lg:row-start-1 lg:min-h-screen lg:px-12 lg:py-10">
          <BrandMark light />

          <div className="max-w-xl py-8 lg:py-0">
            <h2 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
              Acesso autorizado a operacao da portaria.
            </h2>
            <div className="mt-6 grid grid-cols-3 gap-3 text-sm text-[#ffe6f0] lg:mt-8">
              <div className="rounded-md border border-white/20 bg-white/10 p-3">Visitantes</div>
              <div className="rounded-md border border-white/20 bg-white/10 p-3">Prestadores</div>
              <div className="rounded-md border border-white/20 bg-white/10 p-3">Relatorios</div>
            </div>
          </div>

          <div className="pt-6 text-xs tracking-[0.04em] text-[#f3c7da]/80">
            © 2026 Desenvolvido pela equipe de T.I. do Castro&apos;s Park Hotel
          </div>
        </section>
      </div>
    </main>
  )
}
