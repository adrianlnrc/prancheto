import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { QueuePreview } from "@/components/landing/QueuePreview";
import { Reveal } from "@/components/landing/Reveal";

const steps = [
  {
    title: "Cria a pelada e manda o link",
    body: "Um link fixo por grupo. Cola no zap e pronto, ninguém precisa instalar nada.",
  },
  {
    title: "Cada um entra e digita o nome",
    body: "Sem senha, sem cadastro. O nome fica salvo no aparelho pra próxima vez.",
  },
  {
    title: "Os times se sorteiam sozinhos",
    body: "Quando uma leva de nomes fecha o tamanho combinado, o sorteio roda na hora.",
  },
  {
    title: "Vencedor fica, perdedor vai pra fila",
    body: "Time que ganha continua na quadra. Quem perde entra no fim da fila.",
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="border-b border-ink-200 bg-paper">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6 md:px-10">
          <span className="font-display text-lg font-black tracking-[-0.02em]">
            prancheto<span className="text-yellow-500">.</span>
          </span>
          <Link href="/criar">
            <Button variant="outline" size="sm">
              Criar pelada
            </Button>
          </Link>
        </div>
      </header>

      <section className="bg-yellow-500">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-14 md:px-10 lg:grid-cols-2 lg:items-center lg:py-20">
          <div className="pran-rise">
            <div className="flex w-16 flex-col gap-[5px]">
              <div className="h-[2px] bg-ink-900" />
              <div className="h-[2px] bg-ink-900" />
              <div className="h-[2px] bg-ink-900" />
              <div className="h-[2px] bg-paper" />
            </div>
            <div className="h-5" />
            <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-900">
              Pelada ao vivo
            </div>
            <div className="h-4" />
            <h1 className="max-w-[16ch] font-display text-[38px] font-black leading-[1.05] tracking-[-0.02em] md:text-[48px]">
              A pelada se organiza sozinha.
            </h1>
            <div className="h-4" />
            <p className="max-w-[42ch] font-body text-[15px] leading-[1.6] text-ink-800">
              Manda o link no grupo. Cada um digita o nome, o app monta os times
              e toca o jogo sozinho.
            </p>
            <div className="h-7" />
            <Link href="/criar">
              <Button variant="dark">Criar pelada</Button>
            </Link>
          </div>

          <Reveal delayMs={120}>
            <QueuePreview />
            <div className="h-2.5" />
            <p className="text-center font-body text-[12px] text-ink-800">
              Como fica na quadra, em tempo real pra todo mundo.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="bg-paper">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 md:px-10 md:py-20">
          <Reveal>
            <h2 className="font-display text-[28px] font-black leading-[1.1] tracking-[-0.02em] md:text-[34px]">
              Como funciona
            </h2>
          </Reveal>
          <div className="h-8" />
          <div className="grid gap-x-10 md:grid-cols-2">
            {steps.map((step, i) => (
              <Reveal key={step.title} delayMs={i * 70}>
                <div className="flex gap-4 border-b border-ink-200 py-5 first:pt-0 md:py-6">
                  <span className="font-mono-app text-[13px] font-bold text-ink-400">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <div className="font-display text-[17px] font-black leading-[1.2]">
                      {step.title}
                    </div>
                    <div className="h-1.5" />
                    <p className="max-w-[38ch] font-body text-[14px] leading-[1.55] text-ink-600">
                      {step.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-paper-2">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 md:px-10 md:py-20">
          <Reveal>
            <div className="max-w-[46ch]">
              <h2 className="font-display text-[26px] font-black leading-[1.15] tracking-[-0.02em] md:text-[30px]">
                Sem conta pra criar. Sem senha pra lembrar.
              </h2>
              <div className="h-4" />
              <p className="font-body text-[15px] leading-[1.6] text-ink-700">
                Cada grupo tem um link fixo e permanente. Quem abre só digita o
                nome, e a mudança aparece na hora pra todo mundo.
              </p>
              <div className="h-3" />
              <p className="font-body text-[13px] leading-[1.6] text-ink-500">
                Já recebeu um link de pelada? Abre ele direto, não precisa
                passar por aqui, essa página é só pra criar uma nova.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-yellow-500">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 py-16 text-center md:px-10 md:py-20">
          <Reveal>
            <h2 className="max-w-[18ch] font-display text-[30px] font-black leading-[1.1] tracking-[-0.02em] md:text-[40px]">
              Cria a sua pelada agora.
            </h2>
            <div className="h-7" />
            <Link href="/criar">
              <Button variant="dark">Criar pelada</Button>
            </Link>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-ink-200 bg-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-2 px-6 py-10 text-center md:px-10">
          <span className="font-display text-sm font-black tracking-[-0.02em]">
            prancheto<span className="text-yellow-500">.</span>
          </span>
          <p className="font-body text-[13px] text-ink-500">
            Feito pra rodar na quadra, no meio do jogo.
          </p>
        </div>
      </footer>
    </main>
  );
}
