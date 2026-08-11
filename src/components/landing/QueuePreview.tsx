const onCourt: [{ label: string; players: string[] }, { label: string; players: string[] }] = [
  { label: "A", players: ["Rafa", "Bia", "Léo"] },
  { label: "B", players: ["Duda", "Gui", "Tomás"] },
];

const queue: { label: string; players: string[]; size: number }[] = [
  { label: "C", players: ["Cauã", "Vini"], size: 3 },
  { label: "D", players: ["Marina"], size: 3 },
];

export function QueuePreview() {
  const [home, away] = onCourt;

  return (
    <div className="w-full bg-paper" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="bg-yellow-500 px-5 pb-5 pt-4">
        <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-900">
          Em campo agora
        </div>
        <div className="h-3" />
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
          <div>
            <div className="font-display text-[20px] font-black tracking-[-0.02em]">
              Time {home.label}
            </div>
            <div className="h-1.5" />
            {home.players.map((p) => (
              <div key={p} className="font-display text-[13px] font-bold leading-[1.5]">
                {p}
              </div>
            ))}
          </div>
          <div className="pt-1.5 font-display text-xs font-black">x</div>
          <div className="text-right">
            <div className="font-display text-[20px] font-black tracking-[-0.02em]">
              Time {away.label}
            </div>
            <div className="h-1.5" />
            {away.players.map((p) => (
              <div key={p} className="font-display text-[13px] font-bold leading-[1.5]">
                {p}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500">
          Esperando a vez
        </div>
        {queue.map((t, i) => {
          const missing = t.size - t.players.length;
          return (
            <div
              key={t.label}
              className="flex items-baseline gap-3 border-b border-ink-200 py-3 last:border-b-0"
            >
              <span className="font-mono-app text-[12px] font-bold text-ink-400">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex-1">
                <div className="font-display text-[16px] font-black">Time {t.label}</div>
                <div className="font-body text-[12px] text-ink-500">{t.players.join(", ")}</div>
              </div>
              <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-yellow-700">
                falta {missing}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
