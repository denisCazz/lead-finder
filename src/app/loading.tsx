import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="empty-state">
      <Loader2 className="mb-4 h-8 w-8 animate-spin text-[var(--primary)]" />
      <p className="text-sm text-[var(--muted-foreground)]">Sincronizzazione dati in corso...</p>
    </div>
  );
}