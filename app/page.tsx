'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrandMark } from './components/BrandMark'
import { supabase } from './lib/supabase'

type Perfil = 'admin' | 'porteiro'

type Usuario = {
  id: string
  nome: string
  email: string
  perfil: Perfil
  ativo?: boolean | null
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const router = useRouter()

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')
    setCarregando(true)

    const { data, error } = await supabase
      .from('usuarios')
      .select('id,nome,email,perfil,ativo')
      .eq('email', email.trim())
      .eq('senha', senha)
      .maybeSingle<Usuario>()

    setCarregando(false)

    if (error || !data) {
      setErro('E-mail ou senha incorretos.')
      return
    }

    if (data.ativo === false) {
      setErro('Este usuário está inativo. Fale com um administrador.')
      return
    }

    localStorage.setItem('usuario', JSON.stringify(data))
    router.push(data.perfil === 'admin' ? '/admin' : '/porteiro')
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
                <input
                  type="password"
                  value={senha}
                  onChange={(event) => setSenha(event.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-md border border-[#e5d4dc] bg-[#fffafb] px-4 py-3 text-[#2b1420] outline-none transition focus:border-[#97003f] focus:ring-4 focus:ring-[#f3c7da]"
                  required
                />
              </label>

              {erro && (
                <div className="rounded-md border border-[#f3b7cc] bg-[#fff0f6] px-4 py-3 text-sm font-medium text-[#97003f]">
                  {erro}
                </div>
              )}

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
              Acesso autorizado à operação da portaria.
            </h2>
            <div className="mt-6 grid grid-cols-3 gap-3 text-sm text-[#ffe6f0] lg:mt-8">
              <div className="rounded-md border border-white/20 bg-white/10 p-3">
                Visitantes
              </div>
              <div className="rounded-md border border-white/20 bg-white/10 p-3">
                Prestadores
              </div>
              <div className="rounded-md border border-white/20 bg-white/10 p-3">
                Relatórios
              </div>
            </div>
          </div>

          <div className="pt-6 text-xs tracking-[0.08em] text-[#f3c7da]/80">
            Desenvolvido pela equipe de T.I. do Castro&apos;s Park Hotel
          </div>
        </section>
      </div>
    </main>
  )
}
