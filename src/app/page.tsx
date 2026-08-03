import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col bg-yellow-500 p-5">
      <div
        className="flex flex-1 flex-col bg-paper p-9"
        style={{ boxShadow: "var(--shadow-panel)" }}
      >
        <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
          Pelada ao vivo
        </div>
        <div className="h-6" />
        <h1 className="font-display text-[46px] font-black leading-[1.02] tracking-[-0.02em]">
          prancheto<span className="text-yellow-500">.</span>
        </h1>
        <div className="h-5" />
        <div className="flex w-16 flex-col gap-[5px]">
          <div className="h-[2px] bg-ink-900" />
          <div className="h-[2px] bg-ink-900" />
          <div className="h-[2px] bg-yellow-500" />
          <div className="h-[2px] bg-ink-900" />
        </div>
        <div className="h-5" />
        <p className="max-w-[26ch] font-body text-[15px] leading-[1.6] text-ink-600">
          Nenhuma pelada nesse celular ainda. Cria uma e manda o link no grupo —
          quem abrir só digita o nome.
        </p>
        <div className="flex-1" />
        <Link href="/criar">
          <Button fullWidth>Criar pelada</Button>
        </Link>
        <div className="h-3.5" />
        <p className="text-center font-body text-[13px] text-ink-400">
          Abriu por link? Vai direto pro grupo.
        </p>
      </div>
    </main>
  );
}
