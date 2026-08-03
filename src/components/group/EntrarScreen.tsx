"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Group } from "@/lib/types";

export function EntrarScreen({
  group,
  onEntrar,
}: {
  group: Group;
  onEntrar: (name: string) => void;
}) {
  const [name, setName] = useState("");

  return (
    <main className="flex flex-1 flex-col p-6">
      <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
        Você abriu o link de
      </div>
      <div className="h-3.5" />
      <h1 className="font-display text-[34px] font-black leading-[1.08] tracking-[-0.02em]">
        {group.name}
        <span className="text-yellow-500">.</span>
      </h1>
      <div className="h-10" />
      <Input
        label="Seu nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Como te chamam"
        hint="Sem senha, sem cadastro."
        autoFocus
      />
      <div className="flex-1" />
      <Button
        fullWidth
        disabled={!name.trim()}
        onClick={() => onEntrar(name.trim())}
      >
        Bora
      </Button>
    </main>
  );
}
