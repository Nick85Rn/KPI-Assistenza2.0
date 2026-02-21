/* eslint-disable */
import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  Database, Users, AlertCircle, Code, LayoutDashboard, 
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, 
  RefreshCw, X, FileText, ClipboardCheck, Star, Trophy, Target, Clock, Tag, Bug, Zap, CheckCircle2
} from 'lucide-react';
import { 
  format, subWeeks, addWeeks, startOfWeek, endOfWeek, 
  isWithinInterval, getISOWeek, eachDayOfInterval, startOfDay, endOfDay 
} from 'date-fns';
import { it } from 'date-fns/locale'; 
import { supabase } from './supabaseClient';

// --- FORMATTERS ---
const formatNumber = (num) => { if (!num || isNaN(num)) return 0; return Math.ceil(num).toLocaleString('it-IT'); };
const formatTime = (mins) => { 
  if (!mins || isNaN(mins)) return "0m"; 
  if (mins < 60) return `${Math.ceil(mins)}m`; 
  return `${Math.floor(mins / 60)}h ${Math.ceil(mins % 60)}m`; 
};
const formatSeconds = (secs) => {
  if (!secs || isNaN(secs)) return "0s";
  if (secs < 60) return `${Math.ceil(secs)}s`;
  return `${Math.floor(secs / 60)}m ${Math.ceil(secs % 60)}s`;
};
const diffInMinutes = (endStr, startStr) => {
  if (!endStr || !startStr) return 0;
  return Math.max(0, (new Date(endStr) - new Date(startStr)) / 60000);
};
const safeInRange = (dateString, start, end) => { 
  if (!dateString) return false; 
  return isWithinInterval(new Date(dateString), { start: startOfDay(start), end: endOfDay(end) }); 
};

// --- UX COMPONENTS ---
const KPICard = ({ label, current, previous, unit = '', invert = false, type = 'number', icon: Icon, colorClass }) => {
  const diff = current - previous;
  const isPositive = invert ? diff <= 0 : diff >= 0;
  const trendColor = diff === 0 ? 'text-slate-400 bg-slate-100' : isPositive ? 'text-emerald-600 bg-emerald-100' : 'text-rose-600 bg-rose-100';
  
  let displayCurrent = type === 'time' ? formatTime(current) : type === 'seconds' ? formatSeconds(current) : type === 'rating' ? current.toFixed(1) : formatNumber(current);
  let displayDiff = type === 'time' ? formatTime(Math.abs(diff)) : type === 'seconds' ? formatSeconds(Math.abs(diff)) : type === 'rating' ? Math.abs(diff).toFixed(1) : formatNumber(Math.abs(diff));

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
      <div className="flex justify-between items-start mb-2">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        {Icon && <Icon size={16} className={`${colorClass} opacity-50 group-hover:opacity-100 transition-opacity`} />}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-black text-slate-800 tracking-tight">{displayCurrent}</span>
        <span className="text-xs font-bold text-slate-400">{unit}</span>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold ${trendColor}`}>
          {diff > 0 ? <TrendingUp size={12}/> : diff < 0 ? <TrendingDown size={12}/> : null}
          {displayDiff}
        </div>
        <span className="text-[10px] font-medium text-slate-400">vs prec.</span>
      </div>
    </div>
  );
};

const SectionTitle = ({ icon: Icon, title, colorClass, bgClass }) => (
  <div className="flex items-center gap-3 mb-5">
    <div className={`p-2 rounded-xl ${bgClass} shadow-sm`}><Icon size={20} className={colorClass} /></div>
    <h2 className="text-lg font-black text-slate-800 tracking-wide">{title}</h2>
  </div>
);

// --- MAIN APP ---
export default function App() {
  const [view, setView] = useState('dashboard');
  const [data, setData] = useState({ chat: [], ast: [], dev: [] });
  const [loading, setLoading] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [generatedReport, setGeneratedReport] = useState(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [c, a, d] = await Promise.all([
        supabase.from('zoho_raw_chats').select('*'),
        supabase.from('zoho_raw_assistenza').select('*'),
        supabase.from('zoho_raw_sviluppo').select('*')
      ]);
      setData({ chat: c.data||[], ast: a.data||[], dev: d.data||[] });
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const periods = useMemo(() => {
    const s = startOfWeek(currentDate, { weekStartsOn: 1 });
    const e = endOfWeek(currentDate, { weekStartsOn: 1 });
    return { curr: { start: s, end: e, label: `Sett. ${getISOWeek(currentDate)}` }, prev: { start: subWeeks(s, 1), end: subWeeks(e, 1) } };
  }, [currentDate]);

  // --- KPI ENGINE ---
  const kpi = useMemo(() => {
    const calc = (start, end) => {
      // Chat
      const chats = data.chat.filter(x => safeInRange(x.created_time, start, end));
      const respChat = chats.length > 0 ? chats.reduce((a,b) => a + (Number(b.waiting_time_seconds)||0), 0) / chats.length : 0;
      const rated = chats.filter(x => x.rating > 0);
      const avgRating = rated.length > 0 ? rated.reduce((a,b) => a + Number(b.rating), 0) / rated.length : 0;

      // Assistenza
      const astIn = data.ast.filter(x => safeInRange(x.created_time, start, end));
      const astOut = data.ast.filter(x => safeInRange(x.closed_time, start, end));
      const slaAst = astOut.length > 0 ? astOut.reduce((a,x) => a + diffInMinutes(x.closed_time, x.created_time), 0) / astOut.length : 0;

      // Sviluppo
      const devIn = data.dev.filter(x => safeInRange(x.created_time, start, end));
      const devOut = data.dev.filter(x => safeInRange(x.closed_time, start, end));
      const slaDev = devOut.length > 0 ? devOut.reduce((a,x) => a + diffInMinutes(x.closed_time, x.created_time), 0) / devOut.length : 0;
      const backlog = data.dev.filter(x => !x.status?.toLowerCase().includes('chius') && !x.status?.toLowerCase().includes('clos')).length;

      return { chatVol: chats.length, chatWait: respChat, chatRating: avgRating, astIn: astIn.length, astOut: astOut.length, slaAst, devIn: devIn.length, devOut: devOut.length, slaDev, backlog };
    };
    return { curr: calc(periods.curr.start, periods.curr.end), prev: calc(periods.prev.start, periods.prev.end) };
  }, [data, periods]);

  // --- INSIGHTS ENGINE (Leaderboards & Categories) ---
  const insights = useMemo(() => {
    // 1. Top Chat Operators
    const chats = data.chat.filter(x => safeInRange(x.created_time, periods.curr.start, periods.curr.end));
    const opsMap = {};
    chats.forEach(c => {
       const op = c.operator || 'Bot / Non Assegnato';
       if(!opsMap[op]) opsMap[op] = { name: op, count: 0, ratingSum: 0, ratedCount: 0 };
       opsMap[op].count++;
       if(c.rating > 0) { opsMap[op].ratingSum += c.rating; opsMap[op].ratedCount++; }
    });
    const topOps = Object.values(opsMap).map(o => ({
       name: o.name, count: o.count, avgRating: o.ratedCount > 0 ? (o.ratingSum / o.ratedCount).toFixed(1) : '-'
    })).sort((a,b) => b.count - a.count).slice(0, 4);

    // 2. Top Assistenza Categories
    const ast = data.ast.filter(x => safeInRange(x.created_time, periods.curr.start, periods.curr.end));
    const astCatMap = {};
    ast.forEach(t => { const c = t.category || 'Generale'; astCatMap[c] = (astCatMap[c]||0) + 1; });
    const topAstCats = Object.entries(astCatMap).map(([name, count]) => ({name, count})).sort((a,b) => b.count - a.count).slice(0, 4);

    // 3. Top Sviluppo Categories (Bug attivi)
    const devCatsMap = {};
    data.dev.filter(x => !x.status?.toLowerCase().includes('chius')).forEach(t => {
      const c = t.category || 'Generale'; devCatsMap[c] = (devCatsMap[c]||0) + 1;
    });
    const topDevCats = Object.entries(devCatsMap).map(([name, count]) => ({name, count})).sort((a,b) => b.count - a.count).slice(0, 4);

    return { topOps, topAstCats, topDevCats };
  }, [data, periods.curr]);

  const handleGenerateReport = () => {
    const c = kpi.curr; const p = kpi.prev;
    setGeneratedReport(`
      EXECUTIVE SUMMARY: ${periods.curr.label}
      -----------------------------------------
      [CHAT & TEAM]
      Volumi: ${c.chatVol} chat gestite (Trend: ${c.chatVol >= p.chatVol ? '+' : ''}${c.chatVol - p.chatVol})
      Soddisfazione: ${c.chatRating > 0 ? c.chatRating.toFixed(1) + '/5.0' : 'N/A'}
      Tempo attesa medio: ${formatSeconds(c.chatWait)}

      [ASSISTENZA TECNICA]
      Ticket Creati: ${c.astIn} | Ticket Risolti: ${c.astOut}
      SLA di Risoluzione: ${formatTime(c.slaAst)}

      [SVILUPPO & BUG]
      Backlog Attivo: ${c.backlog} bug (Variazione: ${c.backlog >= p.backlog ? '+' : ''}${c.backlog - p.backlog})
      Bug risolti in settimana: ${c.devOut}
    `);
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] text-slate-900 font-sans overflow-hidden">
      {/* SIDEBAR */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col z-20">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-slate-900 p-2 rounded-xl shadow-md"><Database className="text-white" size={18} /></div>
            <h1 className="font-black text-lg tracking-tight">Pienissimo<span className="text-blue-600">.bi</span></h1>
          </div>
          <nav className="space-y-1.5">
            {[ { id: 'dashboard', icon: LayoutDashboard, label: 'Panoramica' }, { id: 'chat', icon: Users, label: 'Reparto Chat' }, { id: 'assistenza', icon: AlertCircle, label: 'Assistenza' }, { id: 'sviluppo', icon: Code, label: 'Sviluppo' } ].map(item => (
              <button key={item.id} onClick={() => setView(item.id)} className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all font-bold text-sm ${view === item.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
                <item.icon size={18} className={view === item.id ? 'text-white' : 'text-slate-400'} /> {item.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* TOPBAR */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-8 py-4 flex justify-between items-center z-10 sticky top-0">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
            <button onClick={() => setCurrentDate(subWeeks(currentDate,1))} className="p-1.5 hover:bg-white rounded-lg transition-all"><ChevronLeft size={16}/></button>
            <span className="text-xs font-black px-4 uppercase tracking-widest text-slate-700">{periods.curr.label}</span>
            <button onClick={() => setCurrentDate(addWeeks(currentDate,1))} className="p-1.5 hover:bg-white rounded-lg transition-all"><ChevronRight size={16}/></button>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleGenerateReport} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm"><FileText size={14} /> Report Executive</button>
            <button onClick={fetchAll} className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md transition-all">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Aggiorna Dati
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-8 pb-32">
          <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {generatedReport && (
              <div className="bg-slate-900 rounded-2xl p-6 relative shadow-2xl text-white mb-8">
                <button onClick={() => setGeneratedReport(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={18}/></button>
                <div className="flex items-center gap-2 mb-4"><ClipboardCheck size={20} className="text-blue-400"/><h3 className="font-bold uppercase text-xs tracking-widest text-blue-400">Appunti per il Management</h3></div>
                <pre className="text-sm font-mono text-slate-200 whitespace-pre-wrap leading-relaxed">{generatedReport}</pre>
              </div>
            )}

            {view === 'dashboard' && (
              <div className="space-y-10">
                {/* REPARTO CHAT (Blue Theme) */}
                <section>
                  <SectionTitle icon={Users} title="Performance Chat & Team" colorClass="text-blue-600" bgClass="bg-blue-100" />
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <KPICard label="Chat Gestite" current={kpi.curr.chatVol} previous={kpi.prev.chatVol} icon={Target} colorClass="text-blue-500" />
                      <KPICard label="Attesa Media" current={kpi.curr.chatWait} previous={kpi.prev.chatWait} type="seconds" invert icon={Clock} colorClass="text-blue-500" />
                      <KPICard label="Soddisfazione" current={kpi.curr.chatRating} previous={kpi.prev.chatRating} type="rating" unit="/ 5" icon={Star} colorClass="text-amber-400" />
                    </div>
                    {/* LEADERBOARD WIDGET */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col">
                      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Trophy size={14} className="text-amber-500"/> Top Operatori</h3>
                      <div className="flex-1 space-y-3">
                        {insights.topOps.length === 0 ? <p className="text-xs text-slate-400">Nessun dato</p> : 
                          insights.topOps.map((op, i) => (
                            <div key={i} className="flex justify-between items-center pb-2 border-b border-slate-50 last:border-0">
                              <div>
                                <span className="text-sm font-bold text-slate-800">{op.name}</span>
                                <div className="flex items-center gap-1 text-[10px] text-amber-500 font-bold mt-0.5"><Star size={10} className="fill-amber-500"/> {op.avgRating}</div>
                              </div>
                              <span className="bg-blue-50 text-blue-700 font-black text-xs px-2 py-1 rounded-md">{op.count}</span>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  </div>
                </section>

                {/* REPARTO ASSISTENZA (Emerald Theme) */}
                <section>
                  <SectionTitle icon={AlertCircle} title="Supporto Tecnico" colorClass="text-emerald-600" bgClass="bg-emerald-100" />
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <KPICard label="Nuovi Ticket" current={kpi.curr.astIn} previous={kpi.prev.astIn} icon={AlertCircle} colorClass="text-emerald-500" />
                      <KPICard label="Ticket Chiusi" current={kpi.curr.astOut} previous={kpi.prev.astOut} icon={CheckCircle2} colorClass="text-emerald-500" />
                      <KPICard label="SLA Risoluzione" current={kpi.curr.slaAst} previous={kpi.prev.slaAst} type="time" invert icon={Clock} colorClass="text-emerald-500" />
                    </div>
                    {/* TOP CATEGORIES WIDGET */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col">
                      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Tag size={14} className="text-emerald-500"/> Categorie Più Frequenti</h3>
                      <div className="flex-1 space-y-3">
                        {insights.topAstCats.length === 0 ? <p className="text-xs text-slate-400">Nessun ticket</p> : 
                          insights.topAstCats.map((cat, i) => (
                            <div key={i} className="flex justify-between items-center pb-2 border-b border-slate-50 last:border-0">
                              <span className="text-xs font-bold text-slate-700 truncate pr-2">{cat.name}</span>
                              <span className="bg-emerald-50 text-emerald-700 font-black text-xs px-2 py-1 rounded-md">{cat.count}</span>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  </div>
                </section>

                {/* REPARTO SVILUPPO (Amber Theme) */}
                <section>
                  <SectionTitle icon={Code} title="Sviluppo & Bug Fixing" colorClass="text-amber-600" bgClass="bg-amber-100" />
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <KPICard label="Backlog Attivo" current={kpi.curr.backlog} previous={kpi.prev.backlog} invert icon={Bug} colorClass="text-rose-500" />
                      <KPICard label="Bug Risolti (Sett.)" current={kpi.curr.devOut} previous={kpi.prev.devOut} icon={Zap} colorClass="text-amber-500" />
                      <KPICard label="Tempo Sviluppo" current={kpi.curr.slaDev} previous={kpi.prev.slaDev} type="time" invert icon={Clock} colorClass="text-amber-500" />
                    </div>
                    {/* BACKLOG STATUS WIDGET */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col">
                      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Bug size={14} className="text-rose-500"/> Emergenze Backlog</h3>
                      <div className="flex-1 space-y-3">
                        {insights.topDevCats.length === 0 ? <p className="text-xs text-emerald-500 font-bold">Nessun bug aperto! 🎉</p> : 
                          insights.topDevCats.map((cat, i) => (
                            <div key={i} className="flex justify-between items-center pb-2 border-b border-slate-50 last:border-0">
                              <span className="text-xs font-bold text-slate-700 truncate pr-2">{cat.name}</span>
                              <span className="bg-rose-50 text-rose-700 font-black text-xs px-2 py-1 rounded-md">{cat.count}</span>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* VISTE DI DETTAGLIO */}
            {view !== 'dashboard' && (
              <div className="flex flex-col items-center justify-center h-96 bg-white rounded-3xl border border-slate-200 shadow-sm border-dashed">
                <LayoutDashboard size={48} className="text-slate-200 mb-4" />
                <h2 className="text-xl font-bold text-slate-800">Sezione Dettaglio in arrivo</h2>
                <p className="text-slate-500 mt-2 text-sm text-center max-w-md">I macro-dati sono tutti sulla Panoramica. Se desideri anche qui grafici specifici, possiamo costruirli su misura.</p>
                <button onClick={() => setView('dashboard')} className="mt-6 px-6 py-2 bg-slate-900 text-white font-bold rounded-xl shadow-md">Torna alla Panoramica</button>
              </div>
            )}
            
          </div>
        </main>
      </div>
    </div>
  );
}