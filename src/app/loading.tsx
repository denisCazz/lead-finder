import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center text-slate-400">
      <Loader2 className="mb-4 h-8 w-8 animate-spin text-indigo-400" />
      <p className="text-sm">Sincronizzazione dati in corso...</p>
    </div>
  );
}