"use client";
import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { 
  ResponsiveContainer, AreaChart, Area, 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend 
} from "recharts";

function DashboardContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedChartType, setSelectedChartType] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("No dashboard ID provided");
      setLoading(false);
      return;
    }

    const fetchDashboard = async () => {
      try {
        const token = localStorage.getItem("token");
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const res = await fetch(`http://localhost:8000/api/v1/dashboards/${id}`, {
          headers
        });

        if (!res.ok) {
          throw new Error(`Failed to load dashboard: ${res.statusText}`);
        }

        const data = await res.json();
        setDashboard(data);
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#050b18] text-slate-400 gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="text-xs font-semibold tracking-wider uppercase">Loading Dashboard Config...</span>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#050b18] text-rose-400 gap-2 p-6 text-center">
        <svg className="w-8 h-8 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h2 className="text-sm font-bold uppercase tracking-wider">Dashboard View Error</h2>
        <p className="text-xs text-slate-400">{error || "Could not find dashboard record."}</p>
      </div>
    );
  }

  const { layout_config } = dashboard;
  const cards = layout_config?.cards || [];
  const chart = layout_config?.charts && layout_config.charts.length > 0 ? layout_config.charts[0] : null;
  const currentChartType = selectedChartType || chart?.chart_type || "bar";

  return (
    <div className="min-h-screen bg-[#050b18] text-slate-200 p-8 space-y-6 font-sans">
      
      {/* HEADER */}
      <header className="flex items-center justify-between pb-5 border-b border-slate-900">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center shadow shadow-blue-500/20">
            <svg className="h-4.5 w-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-none">{dashboard.name}</h1>
            <p className="text-[10px] text-slate-500 mt-1">Standalone View • Created: {new Date(dashboard.created_at).toLocaleString()}</p>
          </div>
        </div>
        
        <button 
          onClick={() => window.close()}
          className="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded border border-slate-800 bg-slate-900/30 transition-colors"
        >
          Close Window
        </button>
      </header>

      {/* KPI CARDS GRID */}
      {cards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cards.map((card: any, idx: number) => (
            <div key={idx} className="glass-panel rounded-xl p-5 border border-slate-900/60 relative overflow-hidden flex flex-col justify-between h-28 hover:border-slate-800 transition-all">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{card.title}</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-white tracking-tight">{card.value}</span>
                {card.change && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    card.change.startsWith("+") ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                  }`}>
                    {card.change}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* GRAPHICS & SUMMARY */}
      {chart ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* CHART */}
          <div className="lg:col-span-2 glass-panel rounded-xl p-5 space-y-4 border border-slate-900/60 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-xs font-semibold text-slate-300 truncate">{chart.title}</h3>
              
              {/* Interactive Selector Toolbar */}
              <div className="flex items-center gap-0.5 bg-slate-950 p-1 rounded-lg border border-slate-900 shrink-0">
                {["bar", "line", "area", "pie"].map((type) => {
                  const isSelected = currentChartType === type;
                  return (
                    <button
                      key={type}
                      onClick={() => setSelectedChartType(type)}
                      className={`px-2 py-1 rounded text-[9px] font-semibold uppercase tracking-wider transition-all ${
                        isSelected
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-[320px] w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                {currentChartType === "area" ? (
                  <AreaChart data={chart.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      {(chart.series || []).map((s: any) => (
                        <linearGradient key={s.key} id={`color_${s.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={s.color || "#3b82f6"} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={s.color || "#3b82f6"} stopOpacity={0.0}/>
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey={chart.xAxisKey} stroke="#64748b" fontSize={9} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={9} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "10px" }} />
                    <Legend wrapperStyle={{ fontSize: "10px", marginTop: "10px" }} />
                    {(chart.series || []).map((s: any) => (
                      <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color || "#3b82f6"} fillOpacity={1} fill={`url(#color_${s.key})`} name={s.label || s.key} strokeWidth={2} />
                    ))}
                  </AreaChart>
                ) : currentChartType === "line" ? (
                  <LineChart data={chart.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey={chart.xAxisKey} stroke="#64748b" fontSize={9} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={9} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "10px" }} />
                    <Legend wrapperStyle={{ fontSize: "10px", marginTop: "10px" }} />
                    {(chart.series || []).map((s: any) => (
                      <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color || "#3b82f6"} name={s.label || s.key} strokeWidth={2.5} dot={{ r: 3 }} />
                    ))}
                  </LineChart>
                ) : currentChartType === "pie" ? (
                  <PieChart>
                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "10px" }} />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    <Pie
                      data={chart.data}
                      dataKey={
                        chart.series && chart.series.length > 0 
                          ? chart.series[0].key 
                          : (chart.data && chart.data.length > 0 
                              ? Object.keys(chart.data[0]).filter(k => typeof chart.data[0][k] === 'number')[0] 
                              : "")
                      }
                      nameKey={chart.xAxisKey}
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={{ fontSize: 9, fill: "#cbd5e1" }}
                    >
                      {chart.data.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={["#06b6d4", "#a855f7", "#10b981", "#f97316", "#f43f5e"][index % 5]} />
                      ))}
                    </Pie>
                  </PieChart>
                ) : (
                  <BarChart data={chart.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey={chart.xAxisKey} stroke="#64748b" fontSize={9} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={9} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "10px" }} />
                    <Legend wrapperStyle={{ fontSize: "10px", marginTop: "10px" }} />
                    {(chart.series || []).map((s: any) => (
                      <Bar key={s.key} dataKey={s.key} fill={s.color || "#3b82f6"} name={s.label || s.key} radius={[4, 4, 0, 0]} />
                    ))}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* INSIGHTS */}
          <div className="glass-panel rounded-xl p-5 border border-slate-900/60 flex flex-col gap-4">
            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI Chart Insight
            </h3>
            <p className="text-xs text-slate-300 leading-normal">
              {chart.summary || "No automated insight summary has been configured for this dashboard layout view."}
            </p>
            <div className="flex-1 border-t border-slate-900/60 pt-4 mt-2">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Data Source</span>
              <p className="text-[11px] text-slate-400 font-mono mt-1">Source Table: {chart.xAxisKey ? "dynamic results mapping" : "N/A"}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-panel rounded-xl p-8 text-center text-slate-500 text-xs">
          No metrics visualization configured in this dashboard layout.
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#050b18] text-slate-400 gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="text-xs font-semibold tracking-wider uppercase">Loading Standalone App Container...</span>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
