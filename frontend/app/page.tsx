"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth, API_BASE, BACKEND_URL } from "@/components/auth-provider";
import { 
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from "recharts";
import MarkdownRenderer from "@/components/markdown-renderer";

export default function WorkspacePage() {
  const { user, token, loading, login, logout, apiFetch } = useAuth();
  
  // Login Form State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [authActionLoading, setAuthActionLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [forgotView, setForgotView] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSuccessMessage, setForgotSuccessMessage] = useState("");

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // App Tabs
  const [activeTab, setActiveTab] = useState<"chat" | "dashboards" | "reports">("chat");

  // Agent Chat States
  const [query, setQuery] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "assistant"; content: string; sql?: string; error?: string }>>([]);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentSteps, setAgentSteps] = useState<string[]>([]);
  
  // Active Analytics Output State
  const [activeSql, setActiveSql] = useState("");
  const [activeData, setActiveData] = useState<any[] | null>(null);
  const [activeChart, setActiveChart] = useState<any | null>(null);
  const [selectedChartType, setSelectedChartType] = useState<string | null>(null);
  const [activeAnomalies, setActiveAnomalies] = useState<any[] | null>(null);
  const [activeReport, setActiveReport] = useState<any | null>(null);

  // Db Schema Browser State
  const [schemaExpanded, setSchemaExpanded] = useState<Record<string, boolean>>({});
  const [tablesList, setTablesList] = useState<Array<{ name: string; columns: string[] }>>([]);

  // Dashboards & Reports List States
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);

  // Ref to chat bottom
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
      // Auto-submit the query for the uploaded file
      handleQuerySubmit(undefined, undefined, file);
    }
  };

  // Resize and Draggable States
  const dragContainerRef = useRef<HTMLDivElement>(null);
  const [chatWidth, setChatWidth] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [savingDashboard, setSavingDashboard] = useState(false);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragContainerRef.current) return;
      const rect = dragContainerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const percentage = (relativeX / rect.width) * 100;
      if (percentage >= 25 && percentage <= 75) {
        setChatWidth(percentage);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (token) {
      fetchSchema();
      fetchDashboards();
      fetchReports();

      // Restore active workspace session from localStorage
      try {
        const stored = localStorage.getItem("insightflow_session");
        if (stored) {
          const session = JSON.parse(stored);
          if (session.chatHistory) setChatHistory(session.chatHistory);
          if (session.activeSql) setActiveSql(session.activeSql);
          if (session.activeData) setActiveData(session.activeData);
          if (session.activeChart) setActiveChart(session.activeChart);
          if (session.activeAnomalies) setActiveAnomalies(session.activeAnomalies);
          if (session.activeReport) setActiveReport(session.activeReport);
        }
      } catch (err) {
        console.error("Failed to restore session:", err);
      }
    } else {
      // Clear workspace states on logout
      setChatHistory([]);
      setActiveSql("");
      setActiveData(null);
      setActiveChart(null);
      setActiveAnomalies(null);
      setActiveReport(null);
      localStorage.removeItem("insightflow_session");
    }
  }, [token]);

  // Persist session state to localStorage
  useEffect(() => {
    if (!token) return;
    const session = {
      chatHistory,
      activeSql,
      activeData,
      activeChart,
      activeAnomalies,
      activeReport
    };
    localStorage.setItem("insightflow_session", JSON.stringify(session));
  }, [chatHistory, activeSql, activeData, activeChart, activeAnomalies, activeReport, token]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory, agentRunning, agentSteps]);

  // Auth Handler
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setAuthActionLoading(true);

    if (isSignUp) {
      try {
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username, email, password }),
        });

        if (res.ok) {
          // Auto log in after sign up
          const success = await login(username, password);
          if (!success) {
            setLoginError("Sign up succeeded but auto-login failed. Please sign in manually.");
          }
        } else {
          const errData = await res.json();
          setLoginError(errData.detail || "Registration failed. Username or email may already be in use.");
        }
      } catch (err) {
        setLoginError("Could not connect to authentication server.");
      } finally {
        setAuthActionLoading(false);
      }
    } else {
      const success = await login(username, password);
      setAuthActionLoading(false);
      if (!success) {
        setLoginError("Invalid username or password");
      }
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setAuthActionLoading(true);
    setForgotSuccessMessage("");

    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: forgotEmail }),
      });

      if (res.ok) {
        setForgotSuccessMessage("Password reset instructions have been sent to your email.");
      } else {
        const errData = await res.json();
        setLoginError(errData.detail || "Failed to process request. Please try again.");
      }
    } catch (err) {
      setLoginError("Could not connect to authentication server.");
    } finally {
      setAuthActionLoading(false);
    }
  };

  // API Call Handlers
  const fetchSchema = async () => {
    try {
      const res = await apiFetch("/tools/sql?query=SELECT%20name%20FROM%20sqlite_master%20WHERE%20type%3D%27table%27%20AND%20name%20NOT%20LIKE%20%27sqlite_%25%27", { method: "POST" });
      const tablesData = await res.json();
      if (tablesData && tablesData.rows) {
        const list = [];
        for (const row of tablesData.rows) {
          const tableName = row.name;
          const colRes = await apiFetch(`/tools/sql?query=PRAGMA%20table_info(${tableName})`, { method: "POST" });
          const colsData = await colRes.json();
          const columns = colsData.rows ? colsData.rows.map((c: any) => `${c.name} (${c.type})`) : [];
          list.push({ name: tableName, columns });
        }
        setTablesList(list);
      }
    } catch (err) {
      console.error("Schema fetch failed:", err);
    }
  };

  const fetchDashboards = async () => {
    try {
      const res = await apiFetch("/dashboards");
      if (res.ok) {
        const data = await res.json();
        setDashboards(data);
      }
    } catch (err) {
      console.error("Dashboards fetch failed:", err);
    }
  };

  const fetchReports = async () => {
    try {
      const res = await apiFetch("/reports");
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      }
    } catch (err) {
      console.error("Reports fetch failed:", err);
    }
  };

  // Submit NLP Query to Agent
  const handleQuerySubmit = async (e?: React.FormEvent, overrideQuery?: string, fileToSubmit?: File | null) => {
    if (e) e.preventDefault();
    const activeFile = fileToSubmit !== undefined ? fileToSubmit : selectedFile;
    const userQuery = overrideQuery !== undefined ? overrideQuery : query;
    if ((!userQuery.trim() && !activeFile) || agentRunning) return;

    setQuery("");
    if (activeFile) {
      setChatHistory(prev => [...prev, { role: "user", content: `Uploaded file **${activeFile.name}**\n\n${userQuery}` }]);
    } else {
      setChatHistory(prev => [...prev, { role: "user", content: userQuery }]);
    }
    setAgentRunning(true);
    setAgentSteps(activeFile 
      ? ["Ingesting document...", "Initializing Microsoft MarkItDown parser..."] 
      : ["Checking database connection & schema...", "Formulating SQL command..."]
    );
    
    // Clear previous dashboard output
    setActiveSql("");
    setActiveData(null);
    setActiveChart(null);
    setSelectedChartType(null);
    setActiveAnomalies(null);
    setActiveReport(null);

    try {
      // Map history for API
      const historyPayload = chatHistory.map(h => ({
        role: h.role === "assistant" ? "assistant" as const : "user" as const,
        content: h.content
      }));

      // Simulate step increments
      const stepTimer1 = setTimeout(() => {
        setAgentSteps(prev => [...prev, activeFile 
          ? "Converting file structure to Markdown format..." 
          : "Executing secure read-only SQL query..."
        ]);
      }, 1000);
      const stepTimer2 = setTimeout(() => {
        setAgentSteps(prev => [...prev, activeFile 
          ? "Analyzing Markdown text & optimizing token size..." 
          : "Performing outlier analysis & configuring chart visuals..."
        ]);
      }, 2500);

      let res;
      if (activeFile) {
        const formData = new FormData();
        formData.append("file", activeFile);
        formData.append("query", userQuery);
        formData.append("chat_history", JSON.stringify(historyPayload));

        res = await apiFetch("/agent/query-file", {
          method: "POST",
          body: formData
        });
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        res = await apiFetch("/agent/query", {
          method: "POST",
          body: JSON.stringify({
            query: userQuery,
            chat_history: historyPayload
          })
        });
      }

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      if (!res.ok) throw new Error("Agent processing error");
      const data = await res.json();

      setAgentSteps(prev => [...prev, "Finalizing explanation summary..."]);

      // Update Chat
      setChatHistory(prev => [...prev, {
        role: "assistant",
        content: data.explanation,
        sql: data.sql_query,
        error: data.errors.length > 0 ? data.errors.join("; ") : undefined
      }]);

      // Set Active Outputs
      if (data.sql_query) setActiveSql(data.sql_query);
      if (data.query_result) setActiveData(data.query_result);
      if (data.chart_config) setActiveChart(data.chart_config);
      if (data.anomalies) setActiveAnomalies(data.anomalies);
      if (data.report) {
        setActiveReport(data.report);
        fetchReports(); // reload reports list
      }
      if (data.dashboard) {
        fetchDashboards(); // reload dashboards list
      }

    } catch (err: any) {
      console.error(err);
      setChatHistory(prev => [...prev, {
        role: "assistant",
        content: "I ran into a server communication error. Please ensure the backend server is running locally.",
        error: err.message
      }]);
    } finally {
      setAgentRunning(false);
      setAgentSteps([]);
    }
  };

  const handleSuggestionClick = (suggested: string) => {
    handleQuerySubmit(undefined, suggested);
  };

  const handleSaveDashboard = async () => {
    if (!activeChart) return;
    
    const dashboardName = prompt("Enter dashboard name:", `Dashboard: ${activeChart.title || "Sales View"}`);
    if (!dashboardName || !dashboardName.trim()) return;
    
    try {
      setSavingDashboard(true);
      const cards = [];
      
      if (activeData && activeData.length > 0) {
        // Identify numeric columns to show sum KPIs
        const keys = Object.keys(activeData[0]);
        const numKeys = keys.filter(k => {
          const kl = k.toLowerCase();
          if (["id", "date", "time", "day", "month", "year", "email"].some(x => kl.includes(x))) return false;
          const v = activeData[0][k];
          return typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)));
        });
        
        for (const k of numKeys.slice(0, 3)) {
          const total = activeData.reduce((sum, row) => sum + Number(row[k] || 0), 0);
          cards.push({
            title: `Total ${k.replace(/_/g, ' ').toUpperCase()}`,
            value: total.toLocaleString(undefined, { maximumFractionDigits: 2 }),
            change: "+3.5%"
          });
        }
      }

      const payload = {
        name: dashboardName.trim(),
        layout_config: {
          cards: cards.length > 0 ? cards : [{ title: "Analyzed records", value: activeData ? activeData.length.toString() : "0", change: "N/A" }],
          charts: [activeChart]
        }
      };

      const res = await apiFetch("/dashboards", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        alert("Dashboard saved successfully!");
        fetchDashboards(); // reload dashboards list
      } else {
        const data = await res.json();
        alert(`Failed to save: ${data.detail || "Unknown error"}`);
      }
    } catch (err: any) {
      alert(`Connection error: ${err.message}`);
    } finally {
      setSavingDashboard(false);
    }
  };

  const loadSavedDashboard = (layout: any) => {
    // Populate visuals on screen
    if (layout.charts && layout.charts.length > 0) {
      setActiveChart(layout.charts[0]);
      setSelectedChartType(null);
      if (layout.charts[0].data) {
        setActiveData(layout.charts[0].data);
      }
    }
    setChatHistory(prev => [...prev, {
      role: "assistant",
      content: `### Loaded Dashboard Layout\nLoaded metric config and rendering components. Total cards initialized: **${layout.cards ? layout.cards.length : 0}**`
    }]);
    setActiveTab("chat");
  };

  // Rendering Loader screen during Auth checks
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#030712]">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-slate-400 text-sm animate-pulse">Loading InsightFlow workspace...</p>
      </div>
    );
  }

  // --- UNAUTHENTICATED LOGIN SCREEN ---
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#020617] px-4 relative overflow-hidden">
        {/* Glow backgrounds */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] animate-pulse-slow"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[100px] animate-pulse-slow"></div>

        <div className="w-full max-w-md glass-panel-glow rounded-2xl p-8 z-10">
          <div className="flex flex-col items-center mb-8">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 mb-3">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">InsightFlow AI</h1>
            <p className="text-slate-400 text-xs text-center mt-1">MCP-Based AI Data Analyst Platform</p>
          </div>

          {forgotView ? (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <h2 className="text-sm font-semibold text-white">Reset Password</h2>
                <p className="text-slate-400 text-xs mt-1">Enter your email address to receive reset instructions</p>
              </div>

              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <div>
                  <label className="block text-slate-400 text-xs font-semibold mb-1">Email Address</label>
                  <input 
                    type="email" 
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    placeholder="name@company.com" 
                    required
                    className="w-full bg-slate-900/80 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                {forgotSuccessMessage && (
                  <p className="text-emerald-500 text-xs mt-1 text-center bg-emerald-500/10 py-1.5 rounded border border-emerald-500/20">{forgotSuccessMessage}</p>
                )}

                {loginError && (
                  <p className="text-rose-500 text-xs mt-1 text-center bg-rose-500/10 py-1.5 rounded border border-rose-500/20">{loginError}</p>
                )}

                <button 
                  type="submit"
                  disabled={authActionLoading}
                  className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-medium py-2.5 rounded-lg text-sm transition-all shadow-md shadow-blue-500/10 flex items-center justify-center"
                >
                  {authActionLoading ? "Loading..." : "Send Reset Instructions"}
                </button>
              </form>

              <div className="mt-4 text-center">
                <button 
                  type="button"
                  onClick={() => {
                    setForgotView(false);
                    setLoginError("");
                    setForgotSuccessMessage("");
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
                >
                  Back to Sign In
                </button>
              </div>
            </div>
          ) : (
            <>
              <form onSubmit={handleAuthSubmit} className="space-y-4">
                <div>
                  <label className="block text-slate-400 text-xs font-semibold mb-1">Username</label>
                  <input 
                    type="text" 
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="analyst" 
                    required
                    className="w-full bg-slate-900/80 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                {isSignUp && (
                  <div>
                    <label className="block text-slate-400 text-xs font-semibold mb-1">Email Address</label>
                    <input 
                      type="email" 
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="name@company.com" 
                      required
                      className="w-full bg-slate-900/80 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                )}
                
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-slate-400 text-xs font-semibold">Password</label>
                    {!isSignUp && (
                      <button 
                        type="button"
                        onClick={() => {
                          setForgotView(true);
                          setLoginError("");
                          setForgotSuccessMessage("");
                        }}
                        className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold transition-colors"
                      >
                        Forgot Password?
                      </button>
                    )}
                  </div>
                  <input 
                    type="password" 
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" 
                    required
                    className="w-full bg-slate-900/80 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                {loginError && (
                  <p className="text-rose-500 text-xs mt-1 text-center bg-rose-500/10 py-1.5 rounded border border-rose-500/20">{loginError}</p>
                )}

                <button 
                  type="submit"
                  disabled={authActionLoading}
                  className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-medium py-2.5 rounded-lg text-sm transition-all shadow-md shadow-blue-500/10 flex items-center justify-center"
                >
                  {authActionLoading ? "Loading..." : isSignUp ? "Create Account" : "Sign In"}
                </button>
              </form>

              <div className="mt-4 text-center">
                <button 
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setLoginError("");
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
                >
                  {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // --- AUTHENTICATED WORKSPACE ---
  return (
    <div className="flex h-screen overflow-hidden text-slate-200">
      
      {/* SIDEBAR */}
      <aside className="w-64 flex flex-col border-r border-slate-900 bg-slate-950/80 backdrop-blur-xl z-20 shrink-0">
        
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-6 py-5 border-b border-slate-900">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center shadow shadow-blue-500/20">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="font-bold tracking-tight text-white text-sm">InsightFlow AI</span>
        </div>

        {/* Tab Selection */}
        <nav className="px-4 py-4 space-y-1 border-b border-slate-900">
          <button 
            onClick={() => setActiveTab("chat")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${activeTab === "chat" ? "bg-slate-900 text-white font-semibold border-l-2 border-blue-500" : "text-slate-400 hover:text-white"}`}
          >
            {/* Chat icon */}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Agent Workspace
          </button>
          
          <button 
            onClick={() => setActiveTab("dashboards")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${activeTab === "dashboards" ? "bg-slate-900 text-white font-semibold border-l-2 border-blue-500" : "text-slate-400 hover:text-white"}`}
          >
            {/* Dashboard icon */}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
            </svg>
            Dashboards
          </button>

          <button 
            onClick={() => setActiveTab("reports")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${activeTab === "reports" ? "bg-slate-900 text-white font-semibold border-l-2 border-blue-500" : "text-slate-400 hover:text-white"}`}
          >
            {/* Reports icon */}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Exported Reports
          </button>
        </nav>

        {/* Sidebar Spacer */}
        <div className="flex-1"></div>

        {/* User profile footer */}
        <div className="p-4 border-t border-slate-900 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center font-bold text-blue-500 text-xs border border-blue-500/20">
              {user.username.slice(0,2).toUpperCase()}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-white leading-none">{user.username}</span>
              <span className="text-[10px] text-slate-400 capitalize mt-0.5">{user.role}</span>
            </div>
          </div>
          <button 
            onClick={logout}
            className="text-slate-500 hover:text-rose-500 transition-colors p-1.5 rounded-lg hover:bg-slate-900"
            title="Log out"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main className="flex-1 flex flex-col bg-[#050b18] overflow-hidden relative">
        
        {/* --- TAB: AGENT CHAT / CHAT WORKSPACE --- */}
        {activeTab === "chat" && (
          <div ref={dragContainerRef} className={`flex-1 flex overflow-hidden ${isDragging ? "select-none" : ""}`}>
            
            {/* LEFT CHAT PANEL */}
            <div 
              style={{ width: `${chatWidth}%` }}
              className="flex flex-col border-r border-slate-900 relative bg-[#040916]/40 shrink-0"
            >
              
              {/* Chat Header */}
              <header className="flex items-center justify-between px-6 py-4 border-b border-slate-900 bg-slate-950/20 backdrop-blur">
                <div>
                  <h2 className="text-sm font-semibold text-white">Agent Playground</h2>
                  <p className="text-[10px] text-slate-400 mt-0.5">Model: {process.env.MODEL_NAME || "openai/gpt-oss-120b"}</p>
                </div>
                
                {/* Reset button */}
                <button 
                  onClick={() => {
                    setChatHistory([]);
                    setActiveSql("");
                    setActiveData(null);
                    setActiveChart(null);
                    setActiveAnomalies(null);
                    setActiveReport(null);
                  }}
                  className="text-slate-400 hover:text-slate-200 text-xs px-2.5 py-1.5 rounded border border-slate-800 bg-slate-900/30 transition-colors"
                >
                  Clear Session
                </button>
              </header>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatHistory.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto">
                    <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
                      <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-slate-200 text-sm">Ask anything about enterprise data</h3>
                    <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
                      Write a query in natural language. The analyst agent will generate query SQL, compile dashboards, or report outliers.
                    </p>

                    {/* Suggestions */}
                    <div className="w-full space-y-2 mt-6">
                      <button 
                        onClick={() => handleSuggestionClick("Show monthly sales revenue trends as an area chart")}
                        className="w-full text-left bg-slate-900/40 hover:bg-slate-900/80 border border-slate-900 hover:border-slate-800 text-[11px] text-slate-300 p-2.5 rounded-lg transition-colors font-mono"
                      >
                        ⚡ Show monthly sales revenue trends as an area chart
                      </button>
                      <button 
                        onClick={() => handleSuggestionClick("Are there any anomalies in daily error rates or web traffic latency?")}
                        className="w-full text-left bg-slate-900/40 hover:bg-slate-900/80 border border-slate-900 hover:border-slate-800 text-[11px] text-slate-300 p-2.5 rounded-lg transition-colors font-mono"
                      >
                        ⚡ Are there any anomalies in daily error rates?
                      </button>
                      <button 
                        onClick={() => handleSuggestionClick("Show the top 5 products by total profit as a bar chart")}
                        className="w-full text-left bg-slate-900/40 hover:bg-slate-900/80 border border-slate-900 hover:border-slate-800 text-[11px] text-slate-300 p-2.5 rounded-lg transition-colors font-mono"
                      >
                        ⚡ Show the top 5 products by total profit
                      </button>
                    </div>
                  </div>
                )}

                {chatHistory.map((msg, i) => {
                  const hasContent = msg.content && msg.content.trim().length > 0;
                  return (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed ${msg.role === "user" ? "bg-blue-600 text-white" : "glass-panel text-slate-200"}`}>
                        
                        {/* Message Content */}
                        <div className="markdown-content font-normal">
                          {hasContent ? (
                            <MarkdownRenderer 
                              content={msg.content} 
                              onSuggestionClick={handleSuggestionClick} 
                            />
                          ) : (
                            <span className="text-slate-500 italic animate-pulse">Empty response received from analyst.</span>
                          )}
                        </div>

                        {/* SQL Toggle if present */}
                        {msg.sql && (
                          <div className="mt-3 pt-3 border-t border-slate-800">
                            <details className="cursor-pointer group">
                              <summary className="text-[10px] font-bold text-blue-400 group-hover:text-blue-300 select-none">
                                Inspect Executed SQL
                              </summary>
                              <pre className="mt-2 p-2 bg-slate-950 rounded text-[10px] font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-tight border border-slate-900">
                                {msg.sql}
                              </pre>
                            </details>
                          </div>
                        )}

                        {/* Error feedback if present */}
                        {msg.error && (
                          <div className="mt-2.5 p-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] rounded font-mono">
                            ⚠️ {msg.error}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Agent Running thinking indicator */}
                {agentRunning && (
                  <div className="flex justify-start">
                    <div className="glass-panel rounded-xl px-4 py-3 text-xs w-[85%]">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex space-x-1">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                        </div>
                        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Agent Planning Workflow...</span>
                      </div>

                      <div className="space-y-1.5 border-l border-slate-800 pl-3.5">
                        {agentSteps.map((step, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-[10px] text-slate-400">
                            <span className="h-1 w-1 bg-emerald-500 rounded-full"></span>
                            {step}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={chatBottomRef}></div>
              </div>

              {/* Chat Input */}
              <form onSubmit={handleQuerySubmit} className="p-4 border-t border-slate-900 bg-slate-950/40">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                  accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.html"
                />
                
                {selectedFile && (
                  <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[10px] text-blue-400 font-mono mb-2 max-w-xs animate-pulse">
                    <span className="truncate flex items-center gap-1.5">📄 {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                    <button 
                      type="button" 
                      onClick={() => setSelectedFile(null)} 
                      className="text-blue-400 hover:text-blue-300 font-bold ml-2 text-xs"
                    >
                      ×
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2 bg-slate-900/60 rounded-xl px-4 py-2 border border-slate-800 focus-within:border-blue-500 transition-colors">
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={agentRunning}
                    className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center disabled:opacity-30"
                    title="Upload file (PDF, Docx, Excel, CSV, Text)"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </button>

                  <input 
                    type="text" 
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    disabled={agentRunning}
                    placeholder={agentRunning ? "Agent orchestrating..." : selectedFile ? "Ask a question about the file, or click Send to analyze..." : "Ask your database: 'What are sales trends by category?'"} 
                    className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                  <button 
                    type="submit"
                    disabled={agentRunning || (!query.trim() && !selectedFile)}
                    className="h-7 w-7 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors flex items-center justify-center text-white disabled:opacity-30 disabled:hover:bg-blue-600"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </div>
              </form>
            </div>

            {/* DRAGGABLE RESIZER HANDLE */}
            <div 
              onMouseDown={startResize}
              className={`w-[3px] hover:w-1 bg-transparent hover:bg-blue-500/40 active:bg-blue-500 cursor-col-resize shrink-0 transition-all z-30 h-full relative group ${isDragging ? "bg-blue-500 w-1" : ""}`}
              title="Drag to resize panels"
            >
              {/* Highlight divider line */}
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] bg-slate-900 group-hover:bg-blue-500/20"></div>
            </div>

            {/* RIGHT ANALYTICAL GRAPHICS PANEL */}
            <div 
              style={{ width: `${100 - chatWidth}%` }}
              className="flex flex-col overflow-y-auto p-6 space-y-6 shrink-0 h-full max-h-full"
            >
              
              {/* Output Tab Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-900">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  {/* Chart icon */}
                  <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
                  </svg>
                  Visualizer Output
                </h2>

                <div className="flex items-center gap-2">
                  {activeChart && (
                    <button 
                      onClick={handleSaveDashboard}
                      disabled={savingDashboard}
                      className="flex items-center gap-1.5 text-[10px] text-blue-400 hover:text-blue-300 font-semibold bg-blue-500/10 px-2.5 py-1.5 rounded border border-blue-500/20 transition-all shadow-sm"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2v-3M9 9h10M9 9l3-3m-3 3l3 3" />
                      </svg>
                      {savingDashboard ? "Saving..." : "Save view as Dashboard"}
                    </button>
                  )}

                  {activeReport && (
                    <a 
                      href={`${BACKEND_URL}${activeReport.download_url}`}
                      download
                      className="flex items-center gap-1.5 text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold bg-emerald-500/10 px-2.5 py-1.5 rounded border border-emerald-500/20 transition-all shadow-sm"
                    >
                      {/* download icon */}
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download CSV Report
                    </a>
                  )}
                </div>
              </div>

              {/* ANOMALY ALERTS BANNER */}
              {activeAnomalies && activeAnomalies.length > 0 && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-2 animate-pulse-slow">
                  <div className="flex items-center gap-2 text-rose-500">
                    {/* alert triangle */}
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <h3 className="text-xs font-bold uppercase tracking-wider">Outliers & Anomalies Flagged ({activeAnomalies.length})</h3>
                  </div>
                  <div className="space-y-1.5">
                    {activeAnomalies.map((anom, idx) => (
                      <p key={idx} className="text-[11px] text-slate-300 leading-normal pl-6 relative">
                        <span className="absolute left-2 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                        {anom.description}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* CHART RENDERING SECTION */}
              {activeChart ? (
                <div className="space-y-6">
                  <div className="glass-panel rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-xs font-semibold text-slate-300 truncate">{activeChart.title}</h3>
                      
                      {/* Interactive Chart Type Customizer */}
                      <div className="flex items-center gap-0.5 bg-slate-950 p-1 rounded-lg border border-slate-900 shrink-0">
                        {["bar", "line", "area", "pie"].map((type) => {
                          const isSelected = (selectedChartType || activeChart.chart_type) === type;
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
                    
                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        {(selectedChartType || activeChart.chart_type) === "area" ? (
                          <AreaChart data={activeChart.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                              {(activeChart.series || []).map((s: any) => (
                                <linearGradient key={s.key} id={`color_${s.key}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor={s.color || "#3b82f6"} stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor={s.color || "#3b82f6"} stopOpacity={0.0}/>
                                </linearGradient>
                              ))}
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey={activeChart.xAxisKey} stroke="#64748b" fontSize={9} tickLine={false} />
                            <YAxis stroke="#64748b" fontSize={9} tickLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "10px" }} />
                            <Legend wrapperStyle={{ fontSize: "10px", marginTop: "10px" }} />
                            {(activeChart.series || []).map((s: any) => (
                              <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color || "#3b82f6"} fillOpacity={1} fill={`url(#color_${s.key})`} name={s.label || s.key} strokeWidth={2} />
                            ))}
                          </AreaChart>
                        ) : (selectedChartType || activeChart.chart_type) === "line" ? (
                          <LineChart data={activeChart.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey={activeChart.xAxisKey} stroke="#64748b" fontSize={9} tickLine={false} />
                            <YAxis stroke="#64748b" fontSize={9} tickLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "10px" }} />
                            <Legend wrapperStyle={{ fontSize: "10px", marginTop: "10px" }} />
                            {(activeChart.series || []).map((s: any) => (
                              <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color || "#3b82f6"} name={s.label || s.key} strokeWidth={2.5} dot={{ r: 3 }} />
                            ))}
                          </LineChart>
                        ) : (selectedChartType || activeChart.chart_type) === "pie" ? (
                          <PieChart>
                            <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "10px" }} />
                            <Legend wrapperStyle={{ fontSize: "10px" }} />
                            <Pie
                              data={activeChart.data}
                              dataKey={
                                activeChart.series && activeChart.series.length > 0 
                                  ? activeChart.series[0].key 
                                  : (activeChart.data && activeChart.data.length > 0 
                                      ? Object.keys(activeChart.data[0]).filter(k => typeof activeChart.data[0][k] === 'number')[0] 
                                      : "")
                              }
                              nameKey={activeChart.xAxisKey}
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              label={{ fontSize: 9, fill: "#cbd5e1" }}
                            >
                              {activeChart.data.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={["#06b6d4", "#a855f7", "#10b981", "#f97316", "#f43f5e"][index % 5]} />
                              ))}
                            </Pie>
                          </PieChart>
                        ) : (
                          <BarChart data={activeChart.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey={activeChart.xAxisKey} stroke="#64748b" fontSize={9} tickLine={false} />
                            <YAxis stroke="#64748b" fontSize={9} tickLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "10px" }} />
                            <Legend wrapperStyle={{ fontSize: "10px", marginTop: "10px" }} />
                            {(activeChart.series || []).map((s: any) => (
                              <Bar key={s.key} dataKey={s.key} fill={s.color || "#3b82f6"} name={s.label || s.key} radius={[4, 4, 0, 0]} />
                            ))}
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* CHART AI SUMMARY */}
                  {activeChart.summary && (
                    <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl space-y-1">
                      <div className="flex items-center gap-2 text-blue-400">
                        {/* sparkles icon */}
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                        <h4 className="text-[10px] font-bold uppercase tracking-wider">AI Chart Insight</h4>
                      </div>
                      <p className="text-xs text-slate-300 leading-normal">
                        {activeChart.summary}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="glass-panel rounded-xl p-8 text-center text-slate-500 text-xs">
                  Run a query to generate interactive charts.
                </div>
              )}

              {/* RAW DATA TABLE SECTION */}
              {activeData && activeData.length > 0 && (
                <div className="glass-panel rounded-xl overflow-hidden border border-slate-900">
                  <div className="px-5 py-3.5 bg-slate-900/40 border-b border-slate-900 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-300">Raw Data Result ({activeData.length} rows)</h3>
                  </div>
                  <div className="overflow-x-auto max-h-[220px]">
                    <table className="w-full text-left text-[11px] font-mono leading-normal">
                      <thead className="bg-slate-950 text-slate-400 border-b border-slate-900 sticky top-0">
                        <tr>
                          {Object.keys(activeData[0]).map(key => (
                            <th key={key} className="px-4 py-2 border-r border-slate-900 font-semibold">{key}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900">
                        {activeData.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/30">
                            {Object.values(row).map((val: any, colIdx) => (
                              <td key={colIdx} className="px-4 py-1.5 border-r border-slate-900 text-slate-300 truncate max-w-[150px]">
                                {val === null ? <span className="text-slate-600">NULL</span> : String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- TAB: SAVED DASHBOARDS --- */}
        {activeTab === "dashboards" && (
          <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-900">
              <div>
                <h1 className="text-xl font-bold text-white">Saved Dashboards</h1>
                <p className="text-xs text-slate-400 mt-1">Select a stored configuration template to view visual metric layouts.</p>
              </div>
            </div>

            {dashboards.length === 0 ? (
              <div className="glass-panel rounded-2xl p-12 text-center text-slate-500 text-xs">
                No dashboards generated yet. Ask the agent: *"Save a sales dashboard"* to create template layouts.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {dashboards.map(dash => (
                  <div key={dash.id} className="glass-panel rounded-xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between h-40">
                    <div>
                      <h3 className="text-sm font-semibold text-white leading-normal font-sans">{dash.name}</h3>
                      <p className="text-[10px] text-slate-500 mt-1">Generated: {new Date(dash.created_at).toLocaleString()}</p>
                    </div>
                    
                    <button 
                      onClick={() => window.open(`/dashboard?id=${dash.id}`, '_blank')}
                      className="w-full mt-4 bg-slate-900 hover:bg-slate-800 text-[11px] text-blue-400 font-semibold py-2 rounded-lg transition-colors border border-slate-800 text-center flex items-center justify-center gap-1.5"
                    >
                      <span>Open Dashboard in New Window</span>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- TAB: EXPORTED REPORTS --- */}
        {activeTab === "reports" && (
          <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-900">
              <div>
                <h1 className="text-xl font-bold text-white">Exported Reports</h1>
                <p className="text-xs text-slate-400 mt-1">Review and download generated CSV dataset files.</p>
              </div>
            </div>

            {reports.length === 0 ? (
              <div className="glass-panel rounded-2xl p-12 text-center text-slate-500 text-xs">
                No reports generated yet. Ask the agent: *"Download a CSV report for active users"* to export logs.
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map(report => (
                  <div key={report.id} className="glass-panel rounded-xl p-4 flex items-center justify-between hover:border-slate-800 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-200">{report.title}</h4>
                        <p className="text-[10px] text-slate-500 mt-0.5">Status: <span className="text-emerald-400">{report.status}</span> • Created: {new Date(report.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>

                    <a 
                      href={`${BACKEND_URL}${report.file_path}`}
                      download
                      className="bg-slate-900 hover:bg-slate-800 text-[10px] text-slate-300 font-semibold px-3.5 py-1.5 rounded-lg border border-slate-800 transition-colors flex items-center gap-1.5"
                    >
                      <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download CSV
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
