"use client";

import { Button } from "@/components/ui/Button";

export type PosResult = {
  title: string;
  subtitle: string;
  saiLabel: string;
  entraLabel: string;
  depoisLabel: string;
};

export function PosScreen({
  result,
  onVoltar,
}: {
  result: PosResult;
  onVoltar: () => void;
}) {
  return (
    <div className="pran-rise flex flex-1 flex-col bg-yellow-500 p-7">
      <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em]">
        Resultado anotado
      </div>
      <div className="h-6" />
      <h1 className="font-display text-[44px] font-black leading-[1.04] tracking-[-0.02em]">
        {result.title}
      </h1>
      <div className="h-4" />
      <div className="font-display text-xl font-bold leading-[1.35] text-ink-800">
        {result.subtitle}
      </div>
      <div className="h-6" />
      <div className="flex flex-col gap-3.5 border-t-2 border-ink-900 pt-4">
        <Row label="Sai" value={result.saiLabel} />
        <Row label="Entra" value={result.entraLabel} border />
        <Row label="Depois" value={result.depoisLabel} border small />
      </div>
      <div className="flex-1" />
      <Button variant="dark" fullWidth onClick={onVoltar}>
        Voltar pra lista
      </Button>
    </div>
  );
}

function Row({
  label,
  value,
  border,
  small,
}: {
  label: string;
  value: string;
  border?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-baseline gap-3.5",
        border ? "border-t border-ink-900/25 pt-3.5" : "",
      ].join(" ")}
    >
      <span className="min-w-[52px] font-display text-[11px] font-bold uppercase tracking-[0.18em]">
        {label}
      </span>
      <span
        className={[
          "font-display font-black tracking-[-0.02em]",
          small ? "text-base" : "text-2xl",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}
