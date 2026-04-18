import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Programa de Afiliados — BrightTale',
  description:
    'Transforme sua audiência em renda recorrente. Compartilhe o BrightTale e receba comissão sobre cada assinatura gerada.',
}

const STEPS = [
  {
    n: '01',
    title: 'Candidate-se',
    desc: 'Preencha o formulário com seus dados e canal. Nossa equipe avalia e responde em até 5 dias úteis.',
  },
  {
    n: '02',
    title: 'Compartilhe seu link',
    desc: 'Receba seu código e link exclusivo com rastreamento automático. Cada clique e cadastro registrado.',
  },
  {
    n: '03',
    title: 'Receba todo mês',
    desc: 'Cada assinatura gerada pelo seu link gera comissão recorrente. Pagamento via PIX, sem burocracia.',
  },
]

const BENEFITS = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    ),
    title: 'Comissão recorrente',
    desc: 'Ganhe em cada renovação de assinatura, não apenas no primeiro mês.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
    title: 'Dashboard em tempo real',
    desc: 'Acompanhe cliques, conversões e comissões no portal do afiliado.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
      </svg>
    ),
    title: 'Link de rastreamento',
    desc: 'Link único com rastreamento automático de cliques e conversões. Sem integrações técnicas.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
      </svg>
    ),
    title: 'Pagamento via PIX',
    desc: 'Receba diretamente na sua chave PIX todo mês. Mínimo de R$ 100 para saque.',
  },
]

export default function AfiliadosPage() {
  return (
    <div className="min-h-screen bg-[#050A0D] text-[#F0F4F8]">

      {/* ── HERO ── */}
      <section className="relative overflow-hidden pt-24 pb-20 px-6">
        {/* Radial glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-start justify-center"
        >
          <div className="w-[900px] h-[500px] rounded-full bg-teal-500/8 blur-[120px] -translate-y-1/4" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/25 bg-teal-500/8 px-4 py-1.5 text-sm text-teal-400 mb-10">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
            Programa de Afiliados · BrightTale
          </div>

          {/* Headline */}
          <h1
            className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.08] mb-6"
            style={{ fontFamily: 'var(--font-display, inherit)' }}
          >
            <span className="text-[#F0F4F8]">Transforme sua</span>
            <br />
            <span className="text-[#F0F4F8]">audiência em</span>{' '}
            <span className="bg-gradient-to-r from-teal-400 to-cyan-300 bg-clip-text text-transparent">
              renda recorrente.
            </span>
          </h1>

          <p className="text-lg text-[#94A3B8] mb-12 max-w-2xl mx-auto leading-relaxed">
            Compartilhe o BrightTale com sua audiência e receba comissão sobre cada assinatura gerada — todo mês, via PIX, sem burocracia.
          </p>

          {/* Stats strip */}
          <div className="flex flex-wrap justify-center gap-x-10 gap-y-4 mb-12">
            {[
              ['até 30%', 'de comissão recorrente'],
              ['mensal', 'pagamento via PIX'],
              ['tempo real', 'rastreamento de conversões'],
            ].map(([val, label]) => (
              <div key={val} className="text-center">
                <p className="text-2xl font-bold text-teal-400" style={{ fontFamily: 'var(--font-display, inherit)' }}>{val}</p>
                <p className="text-xs text-[#64748B] mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/parceiros/candidatar"
              className="inline-flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-400 text-[#050A0D] font-bold px-8 py-3.5 rounded-xl text-base transition-colors"
            >
              Quero participar
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </a>
            <a
              href="/parceiros/login"
              className="inline-flex items-center justify-center gap-2 border border-[#1E2E40] hover:border-teal-500/40 text-[#94A3B8] hover:text-[#F0F4F8] px-8 py-3.5 rounded-xl text-base font-medium transition-colors"
            >
              Já sou afiliado — Entrar
            </a>
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section className="py-20 px-6 bg-[#0A1017]">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-teal-500 mb-4 text-center">
            Como funciona
          </p>
          <h2
            className="text-3xl md:text-4xl font-bold text-center text-[#F0F4F8] mb-16"
            style={{ fontFamily: 'var(--font-display, inherit)' }}
          >
            Três passos para começar a ganhar
          </h2>

          <div className="space-y-12">
            {STEPS.map((step, i) => (
              <div
                key={step.n}
                className={`flex flex-col md:flex-row items-start gap-6 md:gap-10 ${
                  i % 2 === 1 ? 'md:flex-row-reverse' : ''
                }`}
              >
                <div className="flex-shrink-0">
                  <span
                    className="text-[5rem] font-bold leading-none text-[#1E2E40]"
                    style={{ fontFamily: 'var(--font-display, inherit)' }}
                  >
                    {step.n}
                  </span>
                </div>
                <div className="pt-3 md:pt-4">
                  <h3
                    className="text-xl font-bold text-[#F0F4F8] mb-2"
                    style={{ fontFamily: 'var(--font-display, inherit)' }}
                  >
                    {step.title}
                  </h3>
                  <p className="text-[#94A3B8] leading-relaxed max-w-md">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BENEFÍCIOS ── */}
      <section className="py-20 px-6 bg-[#050A0D]">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-teal-500 mb-4 text-center">
            Por que participar
          </p>
          <h2
            className="text-3xl md:text-4xl font-bold text-center text-[#F0F4F8] mb-12"
            style={{ fontFamily: 'var(--font-display, inherit)' }}
          >
            Um programa feito para criadores sérios
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                className="rounded-xl border border-[#1E2E40] bg-[#0A1017] p-6 hover:border-teal-500/30 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center mb-4">
                  {b.icon}
                </div>
                <h3 className="font-semibold text-[#F0F4F8] mb-1">{b.title}</h3>
                <p className="text-sm text-[#64748B] leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-20 px-6 bg-[#0A1017] border-t border-[#1E2E40]">
        <div className="max-w-2xl mx-auto text-center">
          <h2
            className="text-3xl md:text-4xl font-bold text-[#F0F4F8] mb-4"
            style={{ fontFamily: 'var(--font-display, inherit)' }}
          >
            Pronto para começar?
          </h2>
          <p className="text-[#94A3B8] mb-8 leading-relaxed">
            A candidatura é gratuita. Nossa equipe analisa e entra em contato em até 5 dias úteis.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/parceiros/candidatar"
              className="inline-flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-400 text-[#050A0D] font-bold px-8 py-3.5 rounded-xl text-base transition-colors"
            >
              Candidatar-se ao programa
            </a>
            <a
              href="/parceiros/login"
              className="inline-flex items-center justify-center border border-[#1E2E40] hover:border-[#2E3E50] text-[#64748B] hover:text-[#94A3B8] px-8 py-3.5 rounded-xl text-base font-medium transition-colors"
            >
              Já tenho conta
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
