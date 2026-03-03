import { useState } from "react";

const DEFAULT_CLIENTS = ["11x", "Arc", "Diio", "Factor", "Nauta", "Planimatik", "Xepelin"];

interface IntegrationCard {
  name: string;
  description: string;
  icon: string;
  type: "gong" | "diio" | "hubspot" | "salesforce";
  available: boolean;
}

const INTEGRATIONS: IntegrationCard[] = [
  {
    name: "Gong",
    description: "Automatically sync call recordings and transcripts from Gong.",
    icon: "🎙️",
    type: "gong",
    available: true,
  },
  {
    name: "Diio",
    description: "Pull call data and rep analytics directly from Diio.",
    icon: "📞",
    type: "diio",
    available: true,
  },
  {
    name: "HubSpot",
    description: "Sync deal data and pipeline directly into Cuota.",
    icon: "🔶",
    type: "hubspot",
    available: false,
  },
  {
    name: "Salesforce",
    description: "Sync deal data and pipeline directly into Cuota.",
    icon: "☁️",
    type: "salesforce",
    available: false,
  },
];

type ClientIntegrations = Record<string, Record<string, boolean>>;

export default function AdminPage() {
  const [integrations, setIntegrations] = useState<ClientIntegrations>(() => {
    try {
      return JSON.parse(localStorage.getItem("cuota_integrations") ?? "{}");
    } catch { return {}; }
  });
  const [activeTab, setActiveTab] = useState<"integrations" | "team">("integrations");

  function toggle(client: string, type: string) {
    setIntegrations(prev => {
      const next = {
        ...prev,
        [client]: { ...(prev[client] ?? {}), [type]: !(prev[client]?.[type] ?? false) },
      };
      localStorage.setItem("cuota_integrations", JSON.stringify(next));
      return next;
    });
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-800">Admin</h1>
        <p className="text-sm text-slate-500 mt-1">Manage integrations, team members, and workspace settings.</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-6">
          {(["integrations", "team"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-semibold border-b-2 capitalize transition-colors ${
                activeTab === tab
                  ? "border-brand-500 text-brand-600"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "integrations" && (
        <div className="space-y-6">
          {/* Integration cards */}
          <div className="grid md:grid-cols-2 gap-4">
            {INTEGRATIONS.map(integration => (
              <div
                key={integration.type}
                className="bg-white border border-slate-200 rounded-card shadow-card p-5"
              >
                <div className="flex items-start gap-3 mb-4">
                  <span className="text-2xl">{integration.icon}</span>
                  <div>
                    <div className="font-bold text-slate-800">{integration.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{integration.description}</div>
                    {!integration.available && (
                      <div className="mt-1 text-[10px] text-amber-600 font-semibold uppercase tracking-wider">
                        Coming Soon
                      </div>
                    )}
                  </div>
                </div>

                {integration.available ? (
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                      Enable per client
                    </div>
                    {DEFAULT_CLIENTS.map(client => {
                      const enabled = integrations[client]?.[integration.type] ?? false;
                      return (
                        <div key={client} className="flex items-center justify-between">
                          <span className="text-sm text-slate-600">{client}</span>
                          <button
                            onClick={() => toggle(client, integration.type)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              enabled ? "bg-brand-500" : "bg-slate-200"
                            }`}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                                enabled ? "translate-x-4" : "translate-x-0.5"
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <button
                    disabled
                    className="w-full py-2 border border-slate-200 text-sm font-semibold text-slate-400 rounded-lg cursor-not-allowed"
                  >
                    Connect (Coming Soon)
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "team" && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-sm font-semibold text-slate-600 mb-1">Team management coming soon</p>
          <p className="text-xs text-slate-400">Invite teammates, manage roles, and view audit logs.</p>
        </div>
      )}
    </div>
  );
}
