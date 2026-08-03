"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createGroup } from "@/lib/game/actions";
import type { Group } from "@/lib/types";

export default function CriarPage() {
  const router = useRouter();
  const [name, setName] = useState("Pelada da Quinta");
  const [group, setGroup] = useState<Group | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGerarLink() {
    setBusy(true);
    setError(null);
    try {
      const created = await createGroup(name.trim() || "Pelada");
      setGroup(created);
    } catch {
      setError("Não deu pra gerar o link agora. Tenta de novo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopiarLink() {
    if (!group) return;
    const url = `${window.location.origin}/p/${group.slug}`;
    await navigator.clipboard.writeText(url).catch(() => {});
  }

  return (
    <main className="flex flex-1 flex-col p-6">
      <Link
        href="/"
        className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500"
      >
        ← Voltar
      </Link>
      <div className="h-7" />
      <h1 className="font-display text-[34px] font-black leading-[1.08] tracking-[-0.02em]">
        Nome da
        <br />
        pelada<span className="text-yellow-500">.</span>
      </h1>
      <div className="h-8" />
      <Input
        label="Nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Pelada da Quinta"
        hint="Aparece pra todo mundo que abrir o link."
        disabled={!!group}
      />

      {group && (
        <div className="pran-rise mt-8">
          <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
            Link fixo do grupo
          </div>
          <div className="h-3" />
          <div className="break-all bg-paper-2 p-4 font-mono-app text-[15px] text-ink-900">
            {typeof window !== "undefined" ? window.location.origin : ""}/p/{group.slug}
          </div>
          <div className="h-2.5" />
          <div className="font-body text-[13px] text-ink-500">
            Esse link não muda. Salva no grupo do zap.
          </div>
        </div>
      )}

      {error && <p className="mt-4 font-body text-sm text-status-danger">{error}</p>}

      <div className="flex-1" />

      {!group ? (
        <Button fullWidth onClick={handleGerarLink} disabled={busy}>
          {busy ? "Gerando..." : "Gerar link"}
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <Button variant="dark" fullWidth onClick={handleCopiarLink}>
            Copiar link
          </Button>
          <Button
            variant="ghost"
            fullWidth
            onClick={() => router.push(`/p/${group.slug}`)}
          >
            Abrir pelada
          </Button>
        </div>
      )}
    </main>
  );
}
