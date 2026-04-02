"use client";

import { useState, useEffect } from "react";
import { Settings, Save, TestTube, Upload } from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data.settings || {});
        setLoading(false);
      });
  }, []);

  async function handleSave() {
    setSaving(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    setSaving(false);
  }

  async function handleTestTelegram() {
    setTestResult("Invio in corso...");
    const res = await fetch("/api/telegram/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Test notifica da Lead Finder! Se vedi questo messaggio, il bot funziona correttamente." }),
    });
    const data = await res.json();
    setTestResult(data.success ? "Notifica inviata con successo!" : `Errore: ${data.error}`);
  }

  async function handleCsvImport() {
    if (!csvFile) return;
    setImporting(true);
    setImportResult("");

    const formData = new FormData();
    formData.append("file", csvFile);

    const res = await fetch("/api/scraper/import-csv", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    setImportResult(`Importati ${data.imported || 0} lead`);
    setImporting(false);
    setCsvFile(null);
  }

  if (loading) return <div className="text-center py-16 text-[var(--muted-foreground)]">Caricamento...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold flex items-center gap-2 mb-8">
        <Settings className="w-8 h-8 text-[var(--primary)]" />
        Impostazioni
      </h1>

      <div className="space-y-6 max-w-2xl">
        {/* API Keys section */}
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold mb-4">Chiavi API</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            Le chiavi API principali sono configurate nelle variabili d'ambiente (.env).
            Qui puoi impostare override o configurazioni aggiuntive.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-[var(--muted-foreground)] mb-1">Email mittente</label>
              <input
                type="email"
                value={settings.email_from || ""}
                onChange={(e) => setSettings({ ...settings, email_from: e.target.value })}
                placeholder="noreply@bitora.it"
                className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--muted-foreground)] mb-1">Max email al giorno</label>
              <input
                type="number"
                value={settings.max_emails_per_day || "20"}
                onChange={(e) => setSettings({ ...settings, max_emails_per_day: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm"
              />
            </div>
          </div>
        </div>

        {/* Telegram */}
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold mb-4">Telegram Bot</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            Per creare un bot Telegram:
          </p>
          <ol className="text-sm text-[var(--muted-foreground)] list-decimal list-inside space-y-1 mb-4">
            <li>Apri Telegram e cerca @BotFather</li>
            <li>Invia /newbot e segui le istruzioni</li>
            <li>Copia il token e inseriscilo in TELEGRAM_BOT_TOKEN nel file .env</li>
            <li>Invia un messaggio al bot, poi visita https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates per trovare il tuo chat_id</li>
            <li>Inserisci il chat_id in TELEGRAM_CHAT_ID nel file .env</li>
          </ol>
          <button
            onClick={handleTestTelegram}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:opacity-90 text-sm font-medium flex items-center gap-2"
          >
            <TestTube className="w-4 h-4" /> Test Notifica Telegram
          </button>
          {testResult && (
            <p className={`text-sm mt-2 ${testResult.includes("successo") ? "text-green-400" : "text-red-400"}`}>
              {testResult}
            </p>
          )}
        </div>

        {/* CSV Import */}
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold mb-4">Import CSV (LinkedIn/Liste)</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            Importa lead da un file CSV. Colonne supportate: company/azienda, contact/referente,
            email, phone/telefono, website/sito, sector/settore, city/città, region/regione.
          </p>
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              className="text-sm text-[var(--muted-foreground)]"
            />
            <button
              onClick={handleCsvImport}
              disabled={!csvFile || importing}
              className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 disabled:opacity-50 text-sm font-medium flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {importing ? "Importazione..." : "Importa"}
            </button>
          </div>
          {importResult && (
            <p className="text-sm mt-2 text-green-400">{importResult}</p>
          )}
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 disabled:opacity-50 font-medium flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? "Salvataggio..." : "Salva Impostazioni"}
        </button>
      </div>
    </div>
  );
}
