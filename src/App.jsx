/* eslint-disable */
import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  Database, Users, AlertCircle, Code, LayoutDashboard, 
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, 
  RefreshCw, X, FileText, ClipboardCheck, Trophy, Target, Clock, Tag, Bug, Zap, CheckCircle2, Copy
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
  
  let displayCurrent = type === 'time' ? formatTime(current) : type === 'seconds' ? formatSeconds(current) : formatNumber(current);
  let displayDiff = type === 'time' ? formatTime(Math.abs(diff)) : type === 'seconds' ? formatSeconds(Math.abs(diff)) : formatNumber(Math.abs(diff));

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

const ChartContainer = ({ title, children, isEmpty, height = 320 }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm w-full flex flex-col" style={{height: `${height}px`}}>
    <h3 className="font-bold text-slate-800 mb-6 flex-shrink-0 text-sm uppercase tracking-wide">{title}</h3>
    <div className="flex-1 w-full relative min-h-0">
      {isEmpty ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300">
          <span className="text-xs font-medium bg-slate-50 px-4 py-2 rounded-lg">Nessun dato nel periodo selezionato</span>
        </div>
      ) : (
        <div style={{ width: '100%', height: '100%' }}>
          <ResponsiveContainer width="99%" height="100%" minWidth={0}>{children}</ResponsiveContainer>
        </div>
      )}
    </div>
  </div>
);

// --- MAIN APP ---
export default function App() {
  const [view, setView] = useState('dashboard');
  const [data, setData] = useState({ chat: [], ast: [], dev: [] });
  const [loading, setLoading] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [generatedReport, setGeneratedReport] = useState(null);
  const [copied, setCopied] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

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
      setLastUpdated(new Date());
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const periods = useMemo(() => {
    const s = startOfWeek(currentDate, { weekStartsOn: 1 });
    const e = endOfWeek(currentDate, { weekStartsOn: 1 });
    const label = `Sett. ${getISOWeek(currentDate)} (${format(s, 'dd MMM', {locale: it})} - ${format(e, 'dd MMM', {locale: it})})`;
    return { curr: { start: s, end: e, label }, prev: { start: subWeeks(s, 1), end: subWeeks(e, 1) } };
  }, [currentDate]);

  // --- KPI & INSIGHTS ENGINE ---
  const kpi = useMemo(() => {
    const calc = (start, end) => {
      const chats = data.chat.filter(x => safeInRange(x.created_time, start, end));
      const respChat = chats.length > 0 ? chats.reduce((a,b) => a + (Number(b.waiting_time_seconds)||0), 0) / chats.length : 0;

      const astIn = data.ast.filter(x => safeInRange(x.created_time, start, end));
      const astOut = data.ast.filter(x => safeInRange(x.closed_time, start, end));
      const slaAst = astOut.length > 0 ? astOut.reduce((a,x) => a + diffInMinutes(x.closed_time, x.created_time), 0) / astOut.length : 0;

      const devIn = data.dev.filter(x => safeInRange(x.created_time, start, end));
      const devOut = data.dev.filter(x => safeInRange(x.closed_time, start, end));
      const slaDev = devOut.length > 0 ? devOut.reduce((a,x) => a + diffInMinutes(x.closed_time, x.created_time), 0) / devOut.length : 0;
      const backlog = data.dev.filter(x => !x.status?.toLowerCase().includes('chius') && !x.status?.toLowerCase().includes('clos')).length;

      return { chatVol: chats.length, chatWait: respChat, astIn: astIn.length, astOut: astOut.length, slaAst, devIn: devIn.length, devOut: devOut.length, slaDev, backlog };
    };
    return { curr: calc(periods.curr.start, periods.curr.end), prev: calc(periods.prev.start, periods.prev.end) };
  }, [data, periods]);

  const trends = useMemo(() => {
    return eachDayOfInterval({ start: periods.curr.start, end: periods.curr.end }).map(day => {
      const dStart = startOfDay(day); const dEnd = endOfDay(day);
      return {
        date: format(day, 'EEE', {locale: it}),
        chatVol: data.chat.filter(x => safeInRange(x.created_time, dStart, dEnd)).length,
        astIn: data.ast.filter(x => safeInRange(x.created_time, dStart, dEnd)).length,
        astOut: data.ast.filter(x => safeInRange(x.closed_time, dStart, dEnd)).length,
        devIn: data.dev.filter(x => safeInRange(x.created_time, dStart, dEnd)).length,
        devOut: data.dev.filter(x => safeInRange(x.closed_time, dStart, dEnd)).length,
      };
    });
  }, [data, periods.curr]);

  const insights = useMemo(() => {
    const chats = data.chat.filter(x => safeInRange(x.created_time, periods.curr.start, periods.curr.end));
    const opsMap = {};
    chats.forEach(c => {
       const op = c.operator || 'Non Assegnato';
       if(!opsMap[op]) opsMap[op] = { name: op, count: 0, waitSum: 0 };
       opsMap[op].count++;
       opsMap[op].waitSum += (Number(c.waiting_time_seconds)||0);
    });
    const allOps = Object.values(opsMap).map(o => ({
       name: o.name, count: o.count, avgWait: o.count > 0 ? o.waitSum / o.count : 0
    })).sort((a,b) => b.count - a.count);

    const ast = data.ast.filter(x => safeInRange(x.created_time, periods.curr.start, periods.curr.end));
    const astCatMap = {}; ast.forEach(t => { const c = t.category || 'Generale'; astCatMap[c] = (astCatMap[c]||0) + 1; });
    const allAstCats = Object.entries(astCatMap).map(([name, count]) => ({name, count})).sort((a,b) => b.count - a.count);

    const devCatsMap = {}; data.dev.filter(x => !x.status?.toLowerCase().includes('chius')).forEach(t => { const c = t.category || 'Generale'; devCatsMap[c] = (devCatsMap[c]||0) + 1; });
    const allDevCats = Object.entries(devCatsMap).map(([name, count]) => ({name, count})).sort((a,b) => b.count - a.count);

    return { allOps, topOps: allOps.slice(0, 4), allAstCats, topAstCats: allAstCats.slice(0, 4), allDevCats, topDevCats: allDevCats.slice(0, 4) };
  }, [data, periods.curr]);

  const handleGenerateReport = () => {
    const c = kpi.curr; const p = kpi.prev;

    const formatTrend = (curr, prev, formatter, invert = false) => {
        const diff = curr - prev;
        if (diff === 0) return `➖ Stabile`;
        const isGood = invert ? diff < 0 : diff > 0;
        const sign = diff > 0 ? '+' : '-';
        const icon = isGood ? '🟢' : '🔴';
        const absVal = formatter ? formatter(Math.abs(diff)) : Math.abs(diff);
        return `${icon} ${sign}${absVal}`;
    };

    const reportText = `📊 REPORT DIREZIONALE PIENISSIMO
🗓️ Periodo: ${periods.curr.label}

📝 SINTESI GENERALE:
In questa settimana il team ha gestito un totale di ${c.chatVol} conversazioni, garantendo un tempo di attesa medio di ${formatSeconds(c.chatWait)} per i nostri clienti. ${insights.topOps.length > 0 ? `Ottimo lavoro per ${insights.topOps[0].name} con ${insights.topOps[0].count} chat prese in carico.` : ''}
Sul fronte tecnico, il reparto Assistenza ha ricevuto ${c.astIn} nuovi ticket, riuscendo a chiuderne ${c.astOut} mantenendo uno SLA medio di ${formatTime(c.slaAst)}. 
Contemporaneamente, il team di Sviluppo ha lavorato sul debito tecnico correggendo ${c.devOut} bug, portando il backlog attivo a ${c.backlog} task totali.

⚡ INDICATORI CHIAVE E TREND (VS SETT. PREC.):

💬 REPARTO CHAT
• Volumi Gestiti: ${c.chatVol} (${formatTrend(c.chatVol, p.chatVol, null)})
• Tempo Attesa Medio: ${formatSeconds(c.chatWait)} (${formatTrend(c.chatWait, p.chatWait, formatSeconds, true)})

🛠️ SUPPORTO TECNICO
• Ticket Chiusi: ${c.astOut} (${formatTrend(c.astOut, p.astOut, null)})
• SLA di Risoluzione: ${formatTime(c.slaAst)} (${formatTrend(c.slaAst, p.slaAst, formatTime, true)})

💻 SVILUPPO E BUG FIXING
• Bug Risolti: ${c.devOut} (${formatTrend(c.devOut, p.devOut, null)})
• Backlog Attivo: ${c.backlog} (${formatTrend(c.backlog, p.backlog, null, true)})
-----------------------------------------
Generato automaticamente da Pienissimo.bi`;

    setGeneratedReport(reportText);
    setCopied(false);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-inner">
            <button onClick={() => setCurrentDate(subWeeks(currentDate,1))} className="p-1.5 hover:bg-white rounded-lg transition-all"><ChevronLeft size={16}/></button>
            <span className="text-xs font-black px-4 uppercase tracking-widest text-slate-700">{periods.curr.label}</span>
            <button onClick={() => setCurrentDate(addWeeks(currentDate,1))} className="p-1.5 hover:bg-white rounded-lg transition-all"><ChevronRight size={16}/></button>
          </div>
          <div className="flex items-start gap-4">
            <button onClick={handleGenerateReport} className="flex items-center gap-2 px-4 h-[36px] bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm"><FileText size={14} /> Report Executive</button>
            <div className="flex flex-col items-end">
              <button onClick={fetchAll} className="flex items-center gap-2 px-4 h-[36px] bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md transition-all">
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Aggiorna Dati
              </button>
              <span className="text-[10px] text-slate-400 mt-1.5 font-medium mr-1">Ultimo agg.: {format(lastUpdated, 'HH:mm')}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-8 pb-32">
          <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* FINESTRA REPORT GENERATO */}
            {generatedReport && (
              <div className="bg-slate-900 rounded-2xl p-6 relative shadow-2xl text-white mb-8 border border-slate-700">
                <button onClick={() => setGeneratedReport(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={18}/></button>
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2"><ClipboardCheck size={20} className="text-blue-400"/><h3 className="font-bold uppercase text-xs tracking-widest text-blue-400">Report per la Direzione</h3></div>
                  <button onClick={copyToClipboard} className="flex items-center gap-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-all mr-6">
                    {copied ? <CheckCircle2 size={14} className="text-emerald-400"/> : <Copy size={14}/>} {copied ? 'Copiato!' : 'Copia Testo'}
                  </button>
                </div>
                <pre className="text-sm font-mono text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-800/50 p-4 rounded-xl">{generatedReport}</pre>
              </div>
            )}

            {/* VISTA DASHBOARD GLOBALE */}
            {view === 'dashboard' && (
              <div className="space-y-10">
                {/* Reparto Chat */}
                <section>
                  <SectionTitle icon={Users} title="Performance Chat & Team" colorClass="text-blue-600" bgClass="bg-blue-100" />
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <KPICard label="Chat Gestite" current={kpi.curr.chatVol} previous={kpi.prev.chatVol} icon={Target} colorClass="text-blue-500" />
                      <KPICard label="Attesa Media" current={kpi.curr.chatWait} previous={kpi.prev.chatWait} type="seconds" invert icon={Clock} colorClass="text-blue-500" />
                    </div>
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col cursor-pointer hover:border-blue-200 transition-all" onClick={() => setView('chat')}>
                      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Trophy size={14} className="text-amber-500"/> Top Operatori (Tempi e Volumi)</h3>
                      <div className="flex-1 space-y-3">
                        {insights.topOps.length === 0 ? <p className="text-xs text-slate-400">Nessun dato</p> : 
                          insights.topOps.map((op, i) => (
                            <div key={i} className="flex justify-between items-center pb-2 border-b border-slate-50 last:border-0">
                              <div><span className="text-sm font-bold text-slate-800">{op.name}</span><div className="text-[10px] text-slate-500 mt-0.5">Attesa media: {formatSeconds(op.avgWait)}</div></div>
                              <span className="bg-blue-50 text-blue-700 font-black text-xs px-2 py-1 rounded-md">{op.count} chat</span>
                            </div>
                          ))}
                      </div>
                      <div className="mt-3 text-center text-[10px] font-bold text-blue-500 uppercase tracking-wider">Vedi Leaderboard Completa &rarr;</div>
                    </div>
                  </div>
                </section>

                <section>
                  <SectionTitle icon={AlertCircle} title="Supporto Tecnico" colorClass="text-emerald-600" bgClass="bg-emerald-100" />
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <KPICard label="Nuovi Ticket" current={kpi.curr.astIn} previous={kpi.prev.astIn} icon={AlertCircle} colorClass="text-emerald-500" />
                      <KPICard label="Ticket Chiusi" current={kpi.curr.astOut} previous={kpi.prev.astOut} icon={CheckCircle2} colorClass="text-emerald-500" />
                      <KPICard label="SLA Risoluzione" current={kpi.curr.slaAst} previous={kpi.prev.slaAst} type="time" invert icon={Clock} colorClass="text-emerald-500" />
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col cursor-pointer hover:border-emerald-200 transition-all" onClick={() => setView('assistenza')}>
                      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Tag size={14} className="text-emerald-500"/> Top Categorie</h3>
                      <div className="flex-1 space-y-3">
                        {insights.topAstCats.length === 0 ? <p className="text-xs text-slate-400">Nessun ticket</p> : 
                          insights.topAstCats.map((cat, i) => (
                            <div key={i} className="flex justify-between items-center pb-2 border-b border-slate-50 last:border-0">
                              <span className="text-xs font-bold text-slate-700 truncate pr-2">{cat.name}</span>
                              <span className="bg-emerald-50 text-emerald-700 font-black text-xs px-2 py-1 rounded-md">{cat.count}</span>
                            </div>
                          ))}
                      </div>
                      <div className="mt-3 text-center text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Vedi analisi &rarr;</div>
                    </div>
                  </div>
                </section>

                <section>
                  <SectionTitle icon={Code} title="Sviluppo & Bug Fixing" colorClass="text-amber-600" bgClass="bg-amber-100" />
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <KPICard label="Backlog Attivo" current={kpi.curr.backlog} previous={kpi.prev.backlog} invert icon={Bug} colorClass="text-rose-500" />
                      <KPICard label="Bug Risolti (Sett.)" current={kpi.curr.devOut} previous={kpi.prev.devOut} icon={Zap} colorClass="text-amber-500" />
                      <KPICard label="Tempo Sviluppo" current={kpi.curr.slaDev} previous={kpi.prev.slaDev} type="time" invert icon={Clock} colorClass="text-amber-500" />
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col cursor-pointer hover:border-amber-200 transition-all" onClick={() => setView('sviluppo')}>
                      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Bug size={14} className="text-rose-500"/> Emergenze Backlog</h3>
                      <div className="flex-1 space-y-3">
                        {insights.topDevCats.length === 0 ? <p className="text-xs text-emerald-500 font-bold">Nessun bug aperto! 🎉</p> : 
                          insights.topDevCats.map((cat, i) => (
                            <div key={i} className="flex justify-between items-center pb-2 border-b border-slate-50 last:border-0">
                              <span className="text-xs font-bold text-slate-700 truncate pr-2">{cat.name}</span>
                              <span className="bg-rose-50 text-rose-700 font-black text-xs px-2 py-1 rounded-md">{cat.count}</span>
                            </div>
                          ))}
                      </div>
                      <div className="mt-3 text-center text-[10px] font-bold text-amber-500 uppercase tracking-wider">Vedi backlog &rarr;</div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* DETTAGLIO: CHAT */}
            {view === 'chat' && (
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <SectionTitle icon={Users} title="Analisi Dettagliata Reparto Chat" colorClass="text-blue-600" bgClass="bg-blue-100" />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <ChartContainer title="Trend Volumi Giornalieri" isEmpty={trends.every(t => t.chatVol === 0)}>
                      <BarChart data={trends} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b', textTransform:'capitalize'}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b'}} />
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="chatVol" fill="#3b82f6" radius={[4,4,0,0]} name="Chat Gestite" barSize={40}/>
                      </BarChart>
                    </ChartContainer>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-[320px]">
                    <h3 className="font-bold text-slate-800 mb-4 flex-shrink-0 text-sm uppercase tracking-wide flex items-center gap-2"><Trophy size={16} className="text-amber-500"/> Leaderboard Completa</h3>
                    <div className="flex-1 overflow-auto pr-2 space-y-2">
                      {insights.allOps.length === 0 ? <p className="text-xs text-slate-400 text-center mt-10">Nessuna chat registrata</p> :
                        insights.allOps.map((op, i) => (
                          <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div>
                              <p className="text-sm font-bold text-slate-800">{op.name}</p>
                              <p className="text-[10px] font-medium text-slate-500 mt-0.5">Attesa: {formatSeconds(op.avgWait)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-blue-600">{op.count} <span className="text-[10px] font-medium text-slate-400">chat</span></p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* DETTAGLIO: ASSISTENZA & SVILUPPO */}
            {(view === 'assistenza' || view === 'sviluppo') && (
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <SectionTitle 
                  icon={view === 'assistenza' ? AlertCircle : Code} 
                  title={`Analisi Dettagliata Ticket ${view === 'assistenza' ? 'Assistenza' : 'Sviluppo'}`} 
                  colorClass={view === 'assistenza' ? 'text-emerald-600' : 'text-amber-600'} 
                  bgClass={view === 'assistenza' ? 'bg-emerald-100' : 'bg-amber-100'} 
                />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <ChartContainer title="Rapporto Ticket Creati vs Risolti" isEmpty={trends.every(t => view === 'assistenza' ? (t.astIn === 0 && t.astOut === 0) : (t.devIn === 0 && t.devOut === 0))}>
                      <BarChart data={trends} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b', textTransform:'capitalize'}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b'}} />
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Legend verticalAlign="top" height={36} iconType="circle"/>
                        <Bar dataKey={view === 'assistenza' ? 'astIn' : 'devIn'} fill="#94a3b8" radius={[4,4,0,0]} name="Creati" barSize={30}/>
                        <Bar dataKey={view === 'assistenza' ? 'astOut' : 'devOut'} fill={view === 'assistenza' ? '#10b981' : '#f59e0b'} radius={[4,4,0,0]} name="Risolti" barSize={30}/>
                      </BarChart>
                    </ChartContainer>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-[320px]">
                    <h3 className="font-bold text-slate-800 mb-4 flex-shrink-0 text-sm uppercase tracking-wide flex items-center gap-2">
                      <Tag size={16} className={view === 'assistenza' ? 'text-emerald-500' : 'text-amber-500'}/> Distribuzione Categorie
                    </h3>
                    <div className="flex-1 overflow-auto pr-2 space-y-2">
                      {(view === 'assistenza' ? insights.allAstCats : insights.allDevCats).length === 0 ? <p className="text-xs text-slate-400 text-center mt-10">Nessun dato presente</p> :
                        (view === 'assistenza' ? insights.allAstCats : insights.allDevCats).map((cat, i) => (
                          <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <span className="text-sm font-bold text-slate-700 truncate pr-4">{cat.name}</span>
                            <span className={`px-3 py-1 rounded-lg font-black text-xs ${view === 'assistenza' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{cat.count}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
          </div>
        </main>
      </div>
    </div>
  );
}