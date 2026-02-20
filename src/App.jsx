/* eslint-disable */
import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  Line, ComposedChart 
} from 'recharts';
import { 
  Database, Upload, Users, ClipboardList, AlertCircle, Code, LayoutDashboard, 
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, 
  Info, Loader2, Activity, User, Mail, Sparkles, Copy, Bug, RefreshCw, CheckCircle2, X 
} from 'lucide-react';
import { 
  format, subWeeks, addWeeks, startOfWeek, endOfWeek, 
  isWithinInterval, getISOWeek, eachDayOfInterval, min, max, parseISO, startOfDay, endOfDay 
} from 'date-fns';
import { it } from 'date-fns/locale'; 
import { supabase } from './supabaseClient';

// --- HELPERS ---
const formatNumber = (num) => { if (num === undefined || num === null || isNaN(num)) return 0; return Math.ceil(num).toLocaleString('it-IT'); };
const formatTime = (mins) => { if (!mins || mins === 0 || isNaN(mins)) return "0m"; if (mins < 60) return `${Math.ceil(mins)}m`; return `${Math.floor(mins/60)}h ${Math.ceil(mins%60)}m`; };

// Versione potenziata di safeInRange per gestire i valori nulli del nuovo DB
const safeInRange = (dateString, start, end) => { 
  if (!dateString) return false; 
  const d = new Date(dateString); 
  return isWithinInterval(d, { start: startOfDay(start), end: endOfDay(end) }); 
};

// Calcolo differenza in minuti per SLA reali
const diffInMinutes = (endStr, startStr) => {
  if (!endStr || !startStr) return 0;
  return Math.max(0, (new Date(endStr) - new Date(startStr)) / 60000);
};

// --- COMPONENTI UI ---
const SyncModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center relative transform animate-in zoom-in-95 duration-300">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20}/></button>
        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6"><CheckCircle2 size={40} /></div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">Sincronizzazione Avviata!</h3>
        <p className="text-slate-500 text-sm leading-relaxed mb-6">Make.com sta elaborando i ticket in background. I dati si aggiorneranno automaticamente tra pochi secondi.</p>
        <button onClick={onClose} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all active:scale-95">Ottimo, ho capito</button>
      </div>
    </div>
  );
};

const generateWeeklyReport = (kpi, periods) => {
  const c = kpi.curr; const p = kpi.prev; let reportHTML = []; let plainText = [];
  const addSection = (title, htmlContent, plainContent, status = 'neutral') => {
    const colors = { good: 'text-emerald-700 bg-emerald-50', bad: 'text-rose-700 bg-rose-50', neutral: 'text-slate-700 bg-slate-50', warning: 'text-amber-700 bg-amber-50' };
    reportHTML.push(`<div class="p-4 rounded-xl border-l-4 mb-3 ${colors[status]} border-${status === 'neutral' ? 'slate-400' : status === 'good' ? 'emerald-500' : status === 'warning' ? 'amber-500' : 'rose-500'}"><h4 class="font-bold text-sm uppercase mb-1 opacity-80">${title}</h4><p class="text-sm leading-relaxed">${htmlContent}</p></div>`);
    plainText.push(`[${title.toUpperCase()}]\n${plainContent}\n`);
  };

  const totalVolume = c.chat + c.ast_new + c.form; const prevVolume = p.chat + p.ast_new + p.form;
  const volTrend = (totalVolume - prevVolume) >= 0 ? "in crescita" : "in calo";
  addSection("Panoramica Esecutiva", `La settimana <strong>${periods.curr.label}</strong> si chiude con un volume complessivo di attività <strong>${volTrend}</strong> rispetto alla precedente (<strong>${formatNumber(totalVolume)}</strong> vs ${formatNumber(prevVolume)} interazioni totali). Il carico di lavoro è stato distribuito prevalentemente sul reparto <strong>${c.chat > c.ast_new ? 'Chat' : 'Assistenza'}</strong>.`, `La settimana ${periods.curr.label} si chiude con un volume complessivo di attività ${volTrend} (Totale interazioni: ${totalVolume}).`);

  const chatDiff = c.chat - p.chat; const chatTrend = chatDiff >= 0 ? "+" : "";
  let chatAnalysis = `Il team ha gestito <strong>${formatNumber(c.chat)} conversazioni</strong>. `;
  if (c.chat > 0) {
    if (chatDiff > 0) { chatAnalysis += `Aumento della domanda del ${p.chat > 0 ? ((chatDiff/p.chat)*100).toFixed(0) : 100}%. Tempo medio risposta: <strong>${formatTime(c.avg_resp)}</strong>.`; } else { chatAnalysis += `Volume in calo (${chatTrend}${formatNumber(chatDiff)}). Durata media conversazione: <strong>${formatTime(c.avg_dur)}</strong>.`; }
    addSection("Performance Chat & Supporto", chatAnalysis, chatAnalysis.replace(/<[^>]*>/g, ''), 'good');
  }

  const astSaldo = c.ast_closed - c.ast_new; let astStatus = 'neutral';
  let astText = `Aperti <strong>${formatNumber(c.ast_new)} ticket</strong>, chiusi <strong>${formatNumber(c.ast_closed)}</strong>. `;
  if (c.ast_new > 0) {
    if (astSaldo >= 0) { astText += `Saldo positivo (+${astSaldo}), stiamo smaltendo il pregresso. SLA media reale: <strong>${formatTime(c.ast_resp)}</strong>`; astStatus = 'good'; } else { astText += `⚠️ Attenzione: entrati più ticket dei gestiti (Saldo: ${astSaldo}).`; astStatus = 'bad'; }
    addSection("Ticket Assistenza", astText, astText.replace(/<[^>]*>/g, ''), astStatus);
  }

  if (c.dev_backlog > 0) {
    const devDiff = c.dev_backlog - p.dev_backlog; let devText = `Backlog di sviluppo attuale: <strong>${formatNumber(c.dev_backlog)} bug aperti</strong>. `; let devStatus = 'info';
    if (devDiff < 0) { devText += `Ottimo: backlog ridotto di <strong>${Math.abs(devDiff)}</strong> unità.`; devStatus = 'good'; } else if (devDiff > 0) { devText += `Debito tecnico aumentato di ${devDiff} unità.`; devStatus = 'warning'; }
    addSection("Sviluppo & Bug Fixing", devText, devText.replace(/<[^>]*>/g, ''), devStatus);
  }
  return { html: reportHTML.join(''), text: plainText.join('\n') };
};

const SidebarItem = ({ icon: Icon, label, active, onClick }) => (
  <button onClick={onClick} className={`group flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all duration-200 font-medium text-sm ${active ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-100'}`}>
    <Icon size={18} className={active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-600'} /><span>{label}</span>
  </button>
);

const ChartContainer = ({ title, children, isEmpty, height = 380 }) => (
  <div className={`bg-white p-5 rounded-2xl border border-slate-100 shadow-sm w-full flex flex-col`} style={{height: `${height}px`}}>
    <h3 className="font-bold text-slate-800 mb-4 flex-shrink-0 text-sm uppercase tracking-wide">{title}</h3>
    <div className="flex-1 w-full relative min-h-0">
      {isEmpty ? (<div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300"><Activity size={32} className="mb-2 opacity-20" /><span className="text-xs font-medium">Dati insufficienti</span></div>) : (<div style={{ width: '100%', height: '100%' }}><ResponsiveContainer width="99%" height="100%" minWidth={0}>{children}</ResponsiveContainer></div>)}
    </div>
  </div>
);

const ComparisonRow = ({ label, current, previous, unit = '', invert = false, isTeamMetric = false, isTime = false }) => {
  const valCurr = isTime ? current : Math.ceil(current); const valPrev = isTime ? previous : Math.ceil(previous);
  const diff = valCurr - valPrev; const perc = valPrev !== 0 ? ((diff / valPrev) * 100) : 0;
  const isPositive = invert ? diff <= 0 : diff >= 0; const color = isPositive ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';
  return (
    <div className={`flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl shadow-sm ${isTeamMetric ? 'opacity-90 bg-slate-50/50' : ''}`}>
      <div className="flex flex-col"><span className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider truncate">{label} {isTeamMetric && <span className="bg-slate-200 text-slate-600 text-[9px] px-1.5 py-0.5 rounded">TEAM</span>}</span><span className="text-2xl font-bold text-slate-800 mt-1">{isTime ? formatTime(valCurr) : formatNumber(valCurr)} <span className="text-sm font-normal text-slate-400">{unit}</span></span></div>
      <div className="flex flex-col items-end gap-1"><div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${color}`}>{diff >= 0 ? <TrendingUp size={12}/> : <TrendingDown size={12}/>}{isTime ? formatTime(Math.abs(diff)) : Math.abs(diff).toFixed(0)}</div><span className="text-[10px] text-slate-400">vs {isTime ? formatTime(valPrev) : formatNumber(valPrev)}</span></div>
    </div>
  );
};

export default function App() {
  const [view, setView] = useState('dashboard');
  const [data, setData] = useState({ chat: [], form: [], ast: [], dev: [], noshow: {} });
  const [loading, setLoading] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedOperator, setSelectedOperator] = useState('all'); 
  const [generatedReport, setGeneratedReport] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [c, f, a, d, n] = await Promise.all([
        supabase.from('chat_performance').select('*'),
        supabase.from('formazioni').select('*'),
        // ORA LEGGIAMO DALLE TABELLE RAW!
        supabase.from('zoho_raw_assistenza').select('*'),
        supabase.from('zoho_raw_sviluppo').select('*'),
        supabase.from('manual_noshows').select('*')
      ]);
      const ns = {}; n.data?.forEach(x => ns[x.week_id] = x.count);
      setData({ chat: c.data||[], form: f.data||[], ast: a.data||[], dev: d.data||[], noshow: ns });
    } catch (err) { console.error("Errore Fetch", err); } finally { setLoading(false); }
  };

  const operators = useMemo(() => Array.from(new Set([...data.chat.map(x => x.operator), ...data.form.map(x => x.operator)])).sort(), [data]);

  const periods = useMemo(() => {
    const startCurr = startOfWeek(currentDate, { weekStartsOn: 1 }); const endCurr = endOfWeek(currentDate, { weekStartsOn: 1 });
    const startPrev = subWeeks(startCurr, 1); const endPrev = subWeeks(endCurr, 1);
    return { curr: { start: startCurr, end: endCurr, label: `Sett. ${getISOWeek(currentDate)} (${format(startCurr, 'dd MMM')} - ${format(endCurr, 'dd MMM')})` }, prev: { start: startPrev, end: endPrev } };
  }, [currentDate]);

  // --- IL NUOVO MOTORE DI CALCOLO IN TEMPO REALE ---
  const kpi = useMemo(() => {
    const calc = (start, end) => {
      const chatD = selectedOperator === 'all' ? data.chat : data.chat.filter(x => x.operator === selectedOperator);
      const inRangeChats = chatD.filter(x => safeInRange(x.import_date, start, end));
      const totalChat = inRangeChats.reduce((a,b)=>a+Number(b.chats_accepted),0);
      const avgResp = totalChat > 0 ? inRangeChats.reduce((a,b)=>a+(Number(b.avg_response_time||0)*Number(b.chats_accepted)),0) / totalChat : 0;
      
      const formD = selectedOperator === 'all' ? data.form : data.form.filter(x => x.operator === selectedOperator);
      const inRangeForm = formD.filter(x => safeInRange(x.date, start, end));

      // Filtri sui Ticket Raw
      const astCreated = data.ast.filter(x => safeInRange(x.created_time, start, end));
      const astClosed = data.ast.filter(x => safeInRange(x.closed_time, start, end));
      const devCreated = data.dev.filter(x => safeInRange(x.created_time, start, end));
      const devClosed = data.dev.filter(x => safeInRange(x.closed_time, start, end));

      // Calcolo SLA Reali in minuti
      const avgAstResp = astClosed.length > 0 ? astClosed.reduce((acc, x) => acc + diffInMinutes(x.closed_time, x.created_time), 0) / astClosed.length : 0;
      const avgDevRes = devClosed.length > 0 ? devClosed.reduce((acc, x) => acc + diffInMinutes(x.closed_time, x.created_time), 0) / devClosed.length : 0;

      // Il backlog globale: Ticket non chiusi
      const isClosed = (status) => status && (status.toLowerCase().includes('chius') || status.toLowerCase().includes('clos'));
      const devBacklog = data.dev.filter(x => !isClosed(x.status)).length;

      return { 
        chat: totalChat, avg_resp: avgResp, avg_dur: 0, 
        form: inRangeForm.length, form_hours: inRangeForm.reduce((a,b)=>a+Number(b.duration||0),0)/60, 
        noshow: data.noshow[`${format(start, 'yyyy')}-W${String(getISOWeek(start)).padStart(2,'0')}`] || 0, 
        ast_new: astCreated.length, ast_closed: astClosed.length, ast_resp: avgAstResp, 
        dev_backlog: devBacklog, dev_res: avgDevRes 
      };
    };
    return { curr: calc(periods.curr.start, periods.curr.end), prev: calc(periods.prev.start, periods.prev.end) };
  }, [data, periods, selectedOperator]);

  const dailyMacroTrend = useMemo(() => {
    return eachDayOfInterval({ start: periods.curr.start, end: periods.curr.end }).map(day => {
      const dayStart = startOfDay(day); const dayEnd = endOfDay(day);
      const chatVol = data.chat.filter(x => x.import_date === format(day, 'yyyy-MM-dd')).reduce((s, x) => s + Number(x.chats_accepted), 0);
      const astVol = data.ast.filter(x => safeInRange(x.closed_time, dayStart, dayEnd)).length;
      
      // Calcolo dinamico del backlog storico per il grafico
      const isClosed = (status) => status && (status.toLowerCase().includes('chius') || status.toLowerCase().includes('clos'));
      const devBacklogDay = data.dev.filter(x => new Date(x.created_time) <= dayEnd && (!isClosed(x.status) || new Date(x.closed_time) > dayEnd)).length;

      return { date: format(day, 'EEE', {locale: it}), chat: chatVol, form: 0, ast: astVol, dev: devBacklogDay };
    });
  }, [data, periods]);

  // -- Trend Volumi Ticket Raw --
  const buildTicketTrend = (rawList) => {
    return eachDayOfInterval({ start: periods.curr.start, end: periods.curr.end }).map(day => {
      const dayStart = startOfDay(day); const dayEnd = endOfDay(day);
      const creati = rawList.filter(x => safeInRange(x.created_time, dayStart, dayEnd)).length;
      const risolti = rawList.filter(x => safeInRange(x.closed_time, dayStart, dayEnd)).length;
      return { date: format(day, 'EEE', {locale:it}), creati, risolti };
    });
  };
  const astTrend = useMemo(() => buildTicketTrend(data.ast), [data.ast, periods.curr]);
  const devTrend = useMemo(() => buildTicketTrend(data.dev), [data.dev, periods.curr]);

  // -- NEW: Trend Categorie (Raggruppamento Dinamico) --
  const categoryData = useMemo(() => {
    const list = view === 'assistenza' ? data.ast : data.dev;
    const filtered = list.filter(x => safeInRange(x.created_time, periods.curr.start, periods.curr.end));
    const counts = {};
    filtered.forEach(t => {
      const cat = t.category || 'Non assegnata';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({name, value})).sort((a,b) => b.value - a.value).slice(0, 6);
  }, [data, view, periods.curr]);

  const syncZohoAPI = async () => {
    setLoading(true);
    try {
      const res = await fetch('https://hook.eu1.make.com/46bhvr8e104vt5tfnweaomjkcg2p6bk6');
      if (!res.ok) throw new Error("Make.com API Error");
      setIsSyncModalOpen(true);
      setTimeout(() => { fetchAll(); setLoading(false); }, 3000);
    } catch (err) { alert(err.message); setLoading(false); }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col z-20 shadow-xl">
        <div className="p-6 flex-1">
          <div className="flex items-center gap-3 mb-8"><div className="bg-indigo-600 p-2 rounded-lg"><Database className="text-white" size={20} /></div><h1 className="font-bold text-lg tracking-tight">Pienissimo<span className="text-indigo-600">.bi</span></h1></div>
          <div className="space-y-1">
            <SidebarItem icon={LayoutDashboard} label="Dashboard" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
            <div className="my-4 h-px bg-slate-100 mx-4"></div>
            <SidebarItem icon={Users} label="Chat & Team" active={view === 'chat'} onClick={() => setView('chat')} />
            <SidebarItem icon={AlertCircle} label="Ticket Assistenza" active={view === 'assistenza'} onClick={() => setView('assistenza')} />
            <SidebarItem icon={Code} label="Ticket Sviluppo" active={view === 'sviluppo'} onClick={() => setView('sviluppo')} />
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50">
        <div className="bg-white/90 backdrop-blur-md border-b border-slate-200 px-8 py-4 flex justify-between items-center z-10 sticky top-0">
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
               <button onClick={() => setCurrentDate(subWeeks(currentDate,1))} className="p-1.5 hover:bg-white rounded-md shadow-sm transition-all"><ChevronLeft size={16}/></button>
               <span className="text-xs font-bold w-auto px-4 text-center uppercase tracking-wide text-slate-600">{periods.curr.label}</span>
               <button onClick={() => setCurrentDate(addWeeks(currentDate,1))} className="p-1.5 hover:bg-white rounded-md shadow-sm transition-all"><ChevronRight size={16}/></button>
             </div>
          </div>
          {loading && <div className="flex items-center gap-2 text-indigo-600 text-xs font-bold animate-pulse"><Loader2 size={14} className="animate-spin"/> Aggiornamento...</div>}
        </div>

        <div className="flex-1 overflow-auto p-8 pb-48">
          <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {view === 'dashboard' && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <ComparisonRow label="Chat Gestite" current={kpi.curr.chat} previous={kpi.prev.chat} />
                  <ComparisonRow label="Tempo Risp. Chat" current={kpi.curr.avg_resp} previous={kpi.prev.avg_resp} isTime={true} invert={true} />
                  <ComparisonRow label="Ticket Chiusi (Ast)" current={kpi.curr.ast_closed} previous={kpi.prev.ast_closed} isTeamMetric={true} />
                  <ComparisonRow label="SLA Assistenza Reale" current={kpi.curr.ast_resp} previous={kpi.prev.ast_resp} isTime={true} invert={true} isTeamMetric={true} />
                  <ComparisonRow label="Backlog Sviluppo" current={kpi.curr.dev_backlog} previous={kpi.prev.dev_backlog} invert={true} isTeamMetric={true} />
                  <ComparisonRow label="Tempo Risoluz. Bug" current={kpi.curr.dev_res} previous={kpi.prev.dev_res} isTime={true} invert={true} isTeamMetric={true} />
                </div>
                
                <div className="mt-6">
                  <ChartContainer title="Andamento Operativo Giornaliero Globale" isEmpty={dailyMacroTrend.every(x => x.chat === 0 && x.ast === 0)}>
                    <ComposedChart data={dailyMacroTrend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill:'#64748b', fontSize:12, textTransform: 'capitalize'}} />
                      <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fill:'#64748b', fontSize:12}} />
                      <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fill:'#64748b', fontSize:12}} />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius:'8px', border:'none', boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}} />
                      <Legend wrapperStyle={{paddingTop:'10px'}} />
                      <Bar yAxisId="left" dataKey="chat" name="Chat Gestite" fill="#6366f1" radius={[4,4,0,0]} barSize={20} />
                      <Bar yAxisId="left" dataKey="ast" name="Ticket Chiusi" fill="#10b981" radius={[4,4,0,0]} barSize={20} />
                      <Line yAxisId="right" connectNulls type="monotone" dataKey="dev" name="Backlog Sviluppo (Attivo)" stroke="#f59e0b" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                    </ComposedChart>
                  </ChartContainer>
                </div>
              </>
            )}

            {/* VISTE TICKET: ORA CON CATEGORIE E DATI RAW */}
            {(view === 'assistenza' || view === 'sviluppo') && (
              <>
                <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 capitalize">Ticket {view} (API Live)</h2>
                    <p className="text-slate-500 text-sm mt-1">SLA e Categorie calcolate in tempo reale sui raw data</p>
                  </div>
                  <button onClick={syncZohoAPI} className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md rounded-lg cursor-pointer text-sm font-bold transition-all hover:scale-105 active:scale-95">
                    <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Sincronizza Ora
                  </button>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                  {/* Grafico Volumi (Barre Doppie) */}
                  <div className="lg:col-span-2">
                    <ChartContainer title={`Volumi: Creati vs Risolti (${view})`} isEmpty={view === 'assistenza' ? astTrend.length === 0 : devTrend.length === 0}>
                      <BarChart data={view === 'assistenza' ? astTrend : devTrend} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b', textTransform:'capitalize'}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b'}} />
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Legend verticalAlign="top" height={36}/>
                        <Bar dataKey="creati" fill="#94a3b8" radius={[4,4,0,0]} name="Ticket Creati" barSize={30}/>
                        <Bar dataKey="risolti" fill={view === 'assistenza' ? "#6366f1" : "#10b981"} radius={[4,4,0,0]} name="Ticket Risolti" barSize={30}/>
                      </BarChart>
                    </ChartContainer>
                  </div>

                  {/* NUOVO: Grafico Categorie */}
                  <div>
                    <ChartContainer title="Top Categorie (Settimana)" isEmpty={categoryData.length === 0}>
                      <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9"/>
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 11, fill:'#475569'}} width={100} />
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius:'8px', border:'none'}} />
                        <Bar dataKey="value" fill="#8b5cf6" radius={[0,4,4,0]} barSize={20} />
                      </BarChart>
                    </ChartContainer>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <SyncModal isOpen={isSyncModalOpen} onClose={() => setIsSyncModalOpen(false)} />
    </div>
  );
}