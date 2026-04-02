"use client";

import { useState, useEffect } from "react";
import { Settings, Save, TestTube, Upload, Brain, Clock, RotateCcw, Copy, Check } from "lucide-react";

const PROMPT_FIELDS = [
  {
    key: "prompt_email",
    label: "Prompt Email",
    description: "Istruzioni per generare le cold email. Controlla tono, struttura, lunghezza e stile.",
  },
  {
    key: "prompt_diagnosis",
    label: "Prompt Diagnosi Sito",
    description: "Istruzioni per analizzare il sito web di un lead e produrre una diagnosi dettagliata.",
  },
  {
    key: "prompt_qualification",
    label: "Prompt Qualifica Lead",
    description: "Istruzioni per determinare la priorità e il canale di contatto di un lead.",
  },
  {
    key: "prompt_campaign_plan",
    label: "Prompt Pianificazione Campagna",
    description: "Istruzioni per trasformare una richiesta in un piano di campagna strutturato.",
  },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [testResult, setTestResult] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "prompts" | "automation">("general");

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/settings/defaults").then((r) => r.json()).catch(() => ({})),
    ]).then(([settingsData, defaultsData]) => {
      setSettings(settingsData.settings || settingsData || {});
      setDefaults(defaultsData.defaults || {});
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaveMsg("");
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    setSaving(false);
    setSaveMsg("Salvato!");
    setTimeout(() => setSaveMsg(""), 2000);
  }

  function handleResetPrompt(key: string) {
    if (!defaults[key]) return;
    setSettings({ ...settings, [key]: "" });
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
    const res = await fetch("/api/scraper/import-csv", { method: "POST", body: formData });
    const data = await res.json();
    setImportResult(`Importati ${data.imported || 0} lead`);
    setImporting(false);
    setCsvFile(null);
  }

  function copyWebhookUrl() {
    const baseUrl = settings.app_url || window.location.origin;
    navigator.clipboard.writeText(`${baseUrl}/api/cron/hourly`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleTestCron() {
    setTestResult("Esecuzione cron in corso...");
    try {
      const secret = settings.cron_secret || "";
      const res = await fetch("/api/cron/hourly", {
        method: "POST",
        headers: { "x-cron-secret": secret },
      });
      const data = await res.json();
      if (data.success) {
        setTestResult(`Cron completato! Lead: ${data.scraped}, Analizzati: ${data.analyzed}, Email: ${data.generated}`);
      } else {
        setTestResult(`Errore: ${data.error || "sconosciuto"}`);
      }
    } catch (e) {
      setTestResult(`Errore: ${e instanceof Error ? e.message : "sconosciuto"}`);
    }
  }

  if (loading) return <div className="text-center py-16 text-[var(--muted-foreground)]">Caricamento...</div>;

  const tabs = [
    { id: "general" as const, label: "Generale", icon: Settings },
    { id: "prompts" as const, label: "Prompt AI", icon: Brain },
    { id: "automation" as const, label: "Automazione", icon: Clock },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold flex items-center gap-2 mb-6">
        <Settings className="w-8 h-8 text-[var(--primary)]" />
        Impostazioni
      </h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[var(--muted)] rounded-lg p-1 max-w-lg">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-6 max-w-3xl">
        {/* ═══ TAB: GENERALE ═══ */}
        {activeTab === "general" && (
          <>
            {/* Email config */}
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4">Configurazione Email</h2>
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
                Configura TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID nel file .env per ricevere notifiche.
              </p>
              <button
                onClick={handleTestTelegram}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:opacity-90 text-sm font-medium flex items-center gap-2"
              >
                <TestTube className="w-4 h-4" /> Test Notifica Telegram
              </button>
              {testResult && (
                <p className={`text-sm mt-2 ${testResult.includes("successo") || testResult.includes("completato") ? "text-green-400" : "text-red-400"}`}>
                  {testResult}
                </p>
              )}
            </div>

            {/* CSV Import */}
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4">Import CSV</h2>
              <p className="text-sm text-[var(--muted-foreground)] mb-4">
                Colonne: company/azienda, contact/referente, email, phone/telefono, website/sito, sector/settore, city/città, region/regione.
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
              {importResult && <p className="text-sm mt-2 text-green-400">{importResult}</p>}
            </div>
          </>
        )}

        {/* ═══ TAB: PROMPT AI ═══ */}
        {activeTab === "prompts" && (
          <>
            <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-xl p-4">
              <p className="text-sm text-yellow-200">
                Personalizza i prompt usati dall&apos;AI per generare email, analizzare siti e pianificare campagne.
                Lascia vuoto per usare il prompt predefinito. Il prompt viene caricato dal database ad ogni esecuzione.
              </p>
            </div>

            {PROMPT_FIELDS.map((field) => (
              <div key={field.key} className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold">{field.label}</h2>
                  <button
                    onClick={() => handleResetPrompt(field.key)}
                    className="px-3 py-1 text-xs text-[var(--muted-foreground)] border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] flex items-center gap-1"
                    title="Ripristina il prompt predefinito"
                  >
                    <RotateCcw className="w-3 h-3" /> Default
                  </button>
                </div>
                <p className="text-sm text-[var(--muted-foreground)] mb-3">{field.description}</p>
                <textarea
                  value={settings[field.key] || ""}
                  onChange={(e) => setSettings({ ...settings, [field.key]: e.target.value })}
                  placeholder={defaults[field.key]?.slice(0, 200) + "..." || "Prompt predefinito..."}
                  rows={8}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm font-mono resize-y"
                />
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  {settings[field.key] ? `${settings[field.key].length} caratteri (personalizzato)` : "Usando prompt predefinito"}
                </p>
              </div>
            ))}
          </>
        )}

        {/* ═══ TAB: AUTOMAZIONE ═══ */}
        {activeTab === "automation" && (
          <>
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4">Cron Automatico (Ogni Ora)</h2>
              <p className="text-sm text-[var(--muted-foreground)] mb-4">
                Il sistema può eseguire automaticamente scraping, analisi AI e generazione email ogni ora.
                Configura un servizio esterno (cron-job.org, UptimeRobot, ecc.) per chiamare il webhook.
              </p>

              {/* Toggle */}
              <div className="flex items-center gap-3 mb-4">
                <label className="text-sm font-medium">Abilitato</label>
                <button
                  onClick={() => setSettings({ ...settings, cron_enabled: settings.cron_enabled === "true" ? "false" : "true" })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.cron_enabled === "true" ? "bg-green-600" : "bg-gray-600"
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.cron_enabled === "true" ? "translate-x-6" : "translate-x-0.5"
                  }`} />
                </button>
              </div>

              {/* Webhook URL */}
              <div className="mb-4">
                <label className="block text-sm text-[var(--muted-foreground)] mb-1">URL Webhook</label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={`${settings.app_url || window.location.origin}/api/cron/hourly`}
                    className="flex-1 px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm font-mono"
                  />
                  <button
                    onClick={copyWebhookUrl}
                    className="px-3 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 text-sm flex items-center gap-1"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copiato" : "Copia"}
                  </button>
                </div>
              </div>

              {/* Cron Secret */}
              <div className="mb-4">
                <label className="block text-sm text-[var(--muted-foreground)] mb-1">Cron Secret</label>
                <input
                  type="text"
                  value={settings.cron_secret || ""}
                  onChange={(e) => setSettings({ ...settings, cron_secret: e.target.value })}
                  placeholder="Un segreto che il servizio esterno invierà come header x-cron-secret"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm font-mono"
                />
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  Deve corrispondere alla variabile d&apos;ambiente CRON_SECRET nel file .env
                </p>
              </div>

              {/* App URL */}
              <div className="mb-4">
                <label className="block text-sm text-[var(--muted-foreground)] mb-1">URL App (per webhook)</label>
                <input
                  type="url"
                  value={settings.app_url || ""}
                  onChange={(e) => setSettings({ ...settings, app_url: e.target.value })}
                  placeholder="https://tuodominio.com"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm"
                />
              </div>

              {/* Test button */}
              <button
                onClick={handleTestCron}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:opacity-90 text-sm font-medium flex items-center gap-2"
              >
                <Clock className="w-4 h-4" /> Esegui Cron Adesso
              </button>
              {testResult && activeTab === "automation" && (
                <p className={`text-sm mt-2 ${testResult.includes("completato") ? "text-green-400" : testResult.includes("corso") ? "text-yellow-400" : "text-red-400"}`}>
                  {testResult}
                </p>
              )}
            </div>

            {/* Instructions */}
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="text-lg font-semibold mb-4">Come Configurare</h2>
              <ol className="text-sm text-[var(--muted-foreground)] list-decimal list-inside space-y-2">
                <li>Imposta <code className="bg-[var(--muted)] px-1 rounded">CRON_SECRET</code> nel file .env del server</li>
                <li>Inserisci lo stesso segreto nel campo &quot;Cron Secret&quot; qui sopra</li>
                <li>Vai su <a href="https://cron-job.org" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">cron-job.org</a> (gratuito) o un servizio simile</li>
                <li>Crea un nuovo cron job con:
                  <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                    <li>URL: il webhook copiato sopra</li>
                    <li>Metodo: POST (o GET)</li>
                    <li>Header custom: <code className="bg-[var(--muted)] px-1 rounded">x-cron-secret: IL_TUO_SEGRETO</code></li>
                    <li>Frequenza: ogni 60 minuti</li>
                  </ul>
                </li>
                <li>Attiva il toggle &quot;Abilitato&quot; qui sopra e salva</li>
              </ol>
            </div>
          </>
        )}

        {/* Save button (always visible) */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 disabled:opacity-50 font-medium flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? "Salvataggio..." : "Salva Impostazioni"}
          </button>
          {saveMsg && <span className="text-sm text-green-400">{saveMsg}</span>}
        </div>
      </div>
    </div>
  );
}
