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
    description: "Istruzioni per far decidere all'AI se il lead va inviato subito via email, rivisto manualmente o scartato.",
  },
  {
    key: "prompt_campaign_plan",
    label: "Prompt Pianificazione Campagna",
    description: "Istruzioni per trasformare una richiesta in un solo piano campagna strutturato e realistico.",
  },
  {
    key: "prompt_whatsapp",
    label: "Prompt WhatsApp",
    description: "Istruzioni per generare messaggi WhatsApp brevi, umani e pronti per outreach manuale.",
  },
  {
    key: "prompt_city_suggestion",
    label: "Prompt Suggerimento Città",
    description: "Istruzioni per scegliere la prossima città più promettente e creare una sola campagna per volta.",
  },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  // Computed here so it's available throughout the whole render, not just inside an IIFE
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [testResult, setTestResult] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState("");
  const [copiedContinuous, setCopiedContinuous] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "prompts" | "automation">("general");
  const appUrl = settings.app_url || (typeof window !== "undefined" ? window.location.origin : "");

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

  if (loading) return <div className="text-center py-16 text-[var(--muted-foreground)]">Caricamento...</div>;

  const tabs = [
    { id: "general" as const, label: "Generale", icon: Settings },
    { id: "prompts" as const, label: "Prompt AI", icon: Brain },
    { id: "automation" as const, label: "Automazione", icon: Clock },
  ];

  return (
    <div>
      <div className="page-header mb-6">
        <h1 className="page-title">
          <Settings className="w-6 h-6 text-[var(--primary)]" />
          Impostazioni
        </h1>
      </div>

      {/* Tabs */}
      <div className="tab-bar w-fit mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab-btn ${activeTab === tab.id ? "tab-btn-active" : ""}`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-6 max-w-6xl">
        {/* ═══ TAB: GENERALE ═══ */}
        {activeTab === "general" && (
          <div className="stack-grid lg:grid-cols-2">
            {/* Email config */}
            <div className="section-card">
              <h2 className="section-title">Configurazione Email</h2>
              <div className="space-y-4">
                <div>
                  <label className="input-label">Email mittente</label>
                  <input
                    type="email"
                    value={settings.email_from || ""}
                    onChange={(e) => setSettings({ ...settings, email_from: e.target.value })}
                    placeholder="noreply@bitora.it"
                    className="input"
                  />
                </div>
                <div>
                  <label className="input-label">Max email al giorno</label>
                  <input
                    type="number"
                    value={settings.max_emails_per_day || "100"}
                    onChange={(e) => setSettings({ ...settings, max_emails_per_day: e.target.value })}
                    className="input"
                  />
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">Usato solo dal worker Invio Mail nei lanci manuali o di debug. L&apos;Automazione Completa invia subito tutte le email approvate dall&apos;AI.</p>
                </div>
              </div>
            </div>

            {/* Telegram */}
            <div className="section-card">
              <h2 className="section-title">Telegram Bot</h2>
              <p className="text-sm text-[var(--muted-foreground)] mb-4">
                Configura TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID nel file .env per ricevere notifiche.
              </p>
              <button
                onClick={handleTestTelegram}
                className="btn btn-primary"
              >
                <TestTube className="w-4 h-4" /> Test Notifica Telegram
              </button>
              {testResult && (
                <p className={`text-sm mt-2 ${testResult.includes("successo") || testResult.includes("completato") ? "text-green-400" : "text-red-400"}`}>
                  {testResult}
                </p>
              )}
            </div>

            {/* WhatsApp Business */}
            <div className="section-card">
              <h2 className="section-title flex items-center gap-2">
                📱 WhatsApp Business API
              </h2>
              <p className="text-sm text-[var(--muted-foreground)] mb-4">
                Per inviare automaticamente i messaggi WhatsApp configura le variabili nel .env:
              </p>
              <div className="rounded-lg bg-[var(--muted)] p-3 text-xs font-mono text-[var(--muted-foreground)] space-y-1 mb-4">
                <p>WHATSAPP_TOKEN=il_tuo_token</p>
                <p>WHATSAPP_PHONE_ID=il_tuo_phone_id</p>
                <p>WHATSAPP_TEMPLATE_NAME=bitora_intro</p>
              </div>
              <div className="text-sm text-[var(--muted-foreground)] space-y-2">
                <p><b className="text-[var(--foreground)]">Setup:</b></p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Crea una app su <span className="text-blue-400">developers.facebook.com</span></li>
                  <li>Abilita il prodotto WhatsApp nell&apos;app</li>
                  <li>Aggiungi e verifica il numero di telefono business</li>
                  <li>Crea un template messaggio (es. &quot;bitora_intro&quot;)</li>
                  <li>Genera un token permanente (System User)</li>
                  <li>Inserisci token e phone ID nel .env</li>
                </ol>
              </div>
              <div className={`mt-4 text-sm font-medium ${settings.whatsapp_status === "configured" ? "text-green-400" : "text-yellow-400"}`}>
                {settings.whatsapp_status === "configured" ? "✅ WhatsApp API configurato" : "⚠️ Senza API i messaggi vengono inviati come link su Telegram"}
              </div>
            </div>

            {/* CSV Import */}
            <div className="section-card">
              <h2 className="section-title">Import CSV</h2>
              <p className="text-sm text-[var(--muted-foreground)] mb-4">
                Colonne: company/azienda, contact/referente, email, phone/telefono, website/sito, sector/settore, city/città, region/regione.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                  className="text-sm text-[var(--muted-foreground)]"
                />
                <button
                  onClick={handleCsvImport}
                  disabled={!csvFile || importing}
                  className="btn btn-primary disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  {importing ? "Importazione..." : "Importa"}
                </button>
              </div>
              {importResult && <p className="text-sm mt-2 text-green-400">{importResult}</p>}
            </div>
          </div>
        )}

        {/* ═══ TAB: PROMPT AI ═══ */}
        {activeTab === "prompts" && (
          <div className="stack-grid xl:grid-cols-2">
            <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-xl p-4">
              <p className="text-sm text-yellow-200">
                Personalizza i prompt usati dall&apos;AI per generare email, analizzare siti e pianificare campagne.
                Lascia vuoto per usare il prompt predefinito. Il prompt viene caricato dal database ad ogni esecuzione.
              </p>
            </div>

            {PROMPT_FIELDS.map((field) => (
              <div key={field.key} className="section-card">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="section-title !mb-0">{field.label}</h2>
                  <button
                    onClick={() => handleResetPrompt(field.key)}
                    className="btn btn-ghost btn-sm"
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
          </div>
        )}

        {/* ═══ TAB: AUTOMAZIONE ═══ */}
        {activeTab === "automation" && (
          <div className="space-y-6">
            {/* ── Loop Continuo ── */}
            <div className="section-card">
              <div className="flex items-center justify-between mb-2 gap-4">
                <h2 className="section-title !mb-0 flex items-center gap-2">
                  ♻️ Automazione Completa
                  <span className="text-xs font-normal text-[var(--muted-foreground)] bg-[var(--muted)] px-2 py-0.5 rounded-full">consigliato</span>
                </h2>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${settings.automation_enabled !== "false" ? "text-green-400" : "text-[var(--muted-foreground)]"}`}>
                    {settings.automation_enabled !== "false" ? "Abilitato" : "Disabilitato"}
                  </span>
                  <button
                    onClick={() => setSettings({ ...settings, automation_enabled: settings.automation_enabled !== "false" ? "false" : "true" })}
                    className={`relative w-12 h-6 rounded-full transition-colors ${settings.automation_enabled !== "false" ? "bg-green-600" : "bg-gray-600"}`}
                    aria-label="Toggle automazione continua"
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.automation_enabled !== "false" ? "translate-x-6" : "translate-x-0.5"}`} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-[var(--muted-foreground)] mb-4">
                Questo e&apos; l&apos;unico job da schedulare: l&apos;AI crea automaticamente una nuova campagna gestita per ogni settore configurato, esegue Ricerca Clienti, Analisi Clienti e Invio Mail. La decisione di inviare o meno l&apos;email e&apos; presa dall&apos;AI lead per lead.
              </p>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm text-[var(--muted-foreground)] mb-1">Intervallo minimo tra due run</label>
                    <input
                      type="number"
                      min="15"
                      step="15"
                      value={settings.automation_interval_minutes || "120"}
                      onChange={(e) => setSettings({ ...settings, automation_interval_minutes: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm"
                    />
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">Se cron-job.org lo chiama prima, il job si auto-salta.</p>
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--muted-foreground)] mb-1">Ultima esecuzione continua</label>
                    <div className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-sm text-[var(--muted-foreground)]">
                      {settings.last_continuous_run_at || "Mai eseguito"}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-[var(--muted-foreground)] mb-1">Settori da automatizzare</label>
                  <textarea
                    value={settings.automation_sectors || ""}
                    onChange={(e) => setSettings({ ...settings, automation_sectors: e.target.value })}
                    rows={4}
                    placeholder={"ristoranti\nhotel e b&b\nedilizia\nofficine auto"}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm resize-y"
                  />
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">Un settore per riga. L&apos;Automazione Completa usa solo campagne AI gestite automaticamente, senza lanciare le campagne manuali gia&apos; presenti.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm text-[var(--muted-foreground)] mb-1">Politica Email del loop</label>
                    <div className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-sm text-[var(--muted-foreground)]">
                      L&apos;AI decide se ogni lead e&apos; pronto per invio immediato, revisione manuale o scarto. Il worker Invio Mail spedisce solo i messaggi approvati dall&apos;AI.
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--muted-foreground)] mb-1">Politica Telegram del loop</label>
                    <div className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-sm text-[var(--muted-foreground)]">
                      Notifica un batch ogni 30 lead trovati e un riepilogo finale con email inviate ed errori.
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-[var(--muted-foreground)] mb-1">URL Webhook</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      readOnly
                      value={`${appUrl}/api/cron/continuous`}
                      className="flex-1 px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm font-mono"
                    />
                    <button
                      onClick={() => {
                        const url = `${appUrl}/api/cron/continuous`;
                        navigator.clipboard.writeText(url);
                        setCopiedContinuous(true);
                        setTimeout(() => setCopiedContinuous(false), 2000);
                      }}
                      className="px-3 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 text-sm flex items-center gap-1"
                    >
                      {copiedContinuous ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedContinuous ? "Copiato" : "Copia"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Configurazione Generale ── */}
            <div className="section-card">
              <h2 className="section-title">Configurazione Generale</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[var(--muted-foreground)] mb-1">App URL</label>
                  <input
                    type="url"
                    value={settings.app_url || ""}
                    onChange={(e) => setSettings({ ...settings, app_url: e.target.value })}
                    placeholder="https://tuodominio.com"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--muted-foreground)] mb-1">Gestione Secret Cron</label>
                  <div className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-sm text-[var(--muted-foreground)]">
                    Il secret reale non viene mostrato né salvato qui. Va configurato solo nel file <code className="bg-[var(--card)] px-1 rounded">.env</code> del server e replicato come header su cron-job.org.
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">
                    La UI espone solo gli endpoint; il valore effettivo resta server-side.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Istruzioni cron-job.org ── */}
            <div className="section-card">
              <h2 className="section-title">Configurazione cron-job.org</h2>
              <ol className="text-sm text-[var(--muted-foreground)] list-decimal list-inside space-y-2">
                <li>Vai su <a href="https://cron-job.org" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">cron-job.org</a> → <strong>Create Cronjob</strong></li>
                <li>Job consigliato unico: <strong>Automazione Completa</strong> → URL <code className="bg-[var(--muted)] px-1 rounded">/api/cron/continuous</code>, schedule suggerito <code className="bg-[var(--muted)] px-1 rounded">5 * * * *</code></li>
                <li>Imposta <code className="bg-[var(--muted)] px-1 rounded">automation_interval_minutes</code> per non farlo girare troppo spesso. Se viene chiamato prima, si auto-salta.</li>
                <li>Non schedulare i worker interni <code className="bg-[var(--muted)] px-1 rounded">/api/cron/daily</code> e <code className="bg-[var(--muted)] px-1 rounded">/api/cron/morning</code>: corrispondono a <strong>Ricerca Clienti + Analisi Clienti</strong> e <strong>Invio Mail</strong> e vengono usati solo dall&apos;Automazione Completa.</li>
                <li>Usa <strong>Smaltisci Arretrato Lead</strong> solo dalla pagina Jobs quando devi recuperare i lead storici: non va schedulato.</li>
                <li>Per il job continuo: Advanced → Request headers → aggiungi <code className="bg-[var(--muted)] px-1 rounded">x-cron-secret: [CRON_SECRET]</code></li>
                <li>Testa prima dalla pagina <a href="/jobs" className="text-blue-400 underline">Jobs</a>, poi controlla gli esiti in <a href="/logs" className="text-blue-400 underline">Log</a>.</li>
              </ol>
            </div>
          </div>
        )}

        {/* Save button (always visible) */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
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
