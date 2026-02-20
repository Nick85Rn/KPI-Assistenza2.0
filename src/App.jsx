/* eslint-disable */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  Line, ComposedChart 
} from 'recharts';
import { 
  Database, Upload, Users, ClipboardList, AlertCircle, Code, LayoutDashboard, 
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, 
  Info, Loader2, Terminal, Activity, User, Mail, Sparkles, Copy, Bug, RefreshCw 
} from 'lucide-react';
import { 
  format, subWeeks, addWeeks, startOfWeek, endOfWeek, 
  isWithinInterval, getISOWeek, eachDayOfInterval, min, max, parseISO, startOfDay, endOfDay 
} from 'date-fns';
import { it } from 'date-fns/locale'; 
import { parseExcel } from './DataParser';
import { supabase } from './supabaseClient';

const formatNumber = (num) => { if (num === undefined || num === null || isNaN(num)) return 0; return Math.ceil(num).toLocaleString('it-IT'); };
const formatTime = (mins) => { if (!mins || mins === 0 || isNaN(mins)) return "0m"; if (mins < 60) return `${Math.ceil(mins)}m`; return `${Math.floor(mins/60)}h ${Math.ceil(mins%60)}m`; };
const safeInRange = (dateString, start, end) => { if (!dateString) return false; const d = parseISO(dateString); return isWithinInterval(d, { start: startOfDay(start), end: endOfDay(end) }); };

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
    if (chatDiff > 0) { chatAnalysis += `Aumento della domanda del ${p.chat > 0 ? ((chatDiff/p.chat)*100).toFixed(0) : 100}%. Nonostante i volumi, tempo medio risposta a <strong>${formatTime(c.avg_resp)}</strong>.`; } else { chatAnalysis += `Volume in calo (${chatTrend}${formatNumber(chatDiff)}). Durata media conversazione: <strong>${formatTime(c.avg_dur)}</strong>.`; }
    addSection("Performance Chat & Supporto", chatAnalysis, chatAnalysis.replace(/<[^>]*>/g, ''), 'good');
  }

  const astSaldo = c.ast_closed - c.ast_new; let astStatus = 'neutral';
  let astText = `Aperti <strong>${formatNumber(c.ast_new)} ticket</strong>, chiusi <strong>${formatNumber(c.ast_closed)}</strong>. `;
  if (c.ast_new > 0) {
    if (astSaldo >= 0) { astText += `Saldo positivo (+${astSaldo}), stiamo smaltendo il pregresso.`; astStatus = 'good'; } else { astText += `⚠️ Attenzione: entrati più ticket dei gestiti (Saldo: ${astSaldo}).`; astStatus = 'bad'; }
    addSection("Ticket Assistenza", astText, astText.replace(/<[^>]*>/g, ''), astStatus);
  }

  if (c.dev_backlog > 0) {
    const devDiff = c.dev_backlog - p.dev_backlog; let devText = `Backlog di sviluppo: <strong>${formatNumber(c.dev_backlog)} ticket aperti</strong>. `; let devStatus = 'info';
    if (devDiff < 0) { devText += `Ottimo: backlog ridotto di <strong>${Math.abs(devDiff)}</strong> unità.`; devStatus = 'good'; } else if (devDiff > 0) { devText += `Debito tecnico aumentato di ${devDiff} unità.`; devStatus = 'warning'; }
    addSection("Sviluppo & Bug Fixing", devText, devText.replace(/<[^>]*>/g, ''), devStatus);
  }

  if (c.form > 0) {
    let formText = `Erogate <strong>${formatNumber(c.form)} sessioni</strong> (tot: <strong>${formatTime(c.form_hours*60)}</strong>). `; let formStatus = 'good';
    if (c.noshow > 0) { formText += `❌ Registrati <strong>${formatNumber(c.noshow)} No-Show</strong>.`; formStatus = 'warning'; } else { formText += `👏 Nessun No-Show registrato.`; }
    addSection("Formazione", formText, formText.replace(/<[^>]*>/g, ''), formStatus);
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
      <div className="flex flex-col items-end gap-1"><div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${color}`}>{diff >= 0 ? <TrendingUp size={12}/> : <TrendingDown size={12}/>}{isTime ? formatTime(Math.abs(diff)) : Math.abs(diff).toFixed(0)} {(!isTime && valPrev !== 0) && <span className="ml-1 text-[10px] opacity-70">({Math.abs(perc).toFixed(0)}%)</span>}</div><span className="text-[10px] text-slate-400">vs {isTime ? formatTime(valPrev) : formatNumber(valPrev)} prec.</span></div>
    </div>
  );
};

const LeaderboardRow = ({ rank, name, chats, formations, score }) => (
  <div className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors border-b border-slate-50 last:border-0">
    <div className="flex items-center gap-3"><div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${rank === 1 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{rank}</div><div className="flex flex-col"><span className="text-sm font-bold text-slate-700">{name}</span><span className="text-[10px] text-slate-400">Score: {formatNumber(score)}</span></div></div>
    <div className="flex gap-4 text-xs font-medium"><div className="text-right w-16"><span className="block text-slate-800">{formatNumber(chats)}</span><span className="block text-[9px] text-slate-400">CHAT</span></div><div className="text-right w-16"><span className="block text-slate-800">{formatNumber(formations)}</span><span className="block text-[9px] text-slate-400">FORM</span></div></div>
  </div>
);

export default function App() {
  const [view, setView] = useState('dashboard');
  const [data, setData] = useState({ chat: [], form: [], ast: [], dev: [], noshow: {} });
  const [loading, setLoading] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedOperator, setSelectedOperator] = useState('all'); 
  const [uploadModal, setUploadModal] = useState(null);
  const [generatedReport, setGeneratedReport] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [logs, setLogs] = useState([]);

  const addLog = (msg, type = 'info') => setLogs(prev => [...prev, { time: new Date(), msg, type }]);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [c, f, a, d, n] = await Promise.all([
        supabase.from('chat_performance').select('*'),
        supabase.from('formazioni').select('*'),
        supabase.from('ticket_assistenza').select('*').order('date'),
        supabase.from('ticket_sviluppo').select('*').order('date'),
        supabase.from('manual_noshows').select('*')
      ]);
      const ns = {}; n.data?.forEach(x => ns[x.week_id] = x.count);
      setData({ chat: c.data||[], form: f.data||[], ast: a.data||[], dev: d.data||[], noshow: ns });
      const dates = [...(c.data||[]).map(x=>x.import_date), ...(f.data||[]).map(x=>x.date), ...(a.data||[]).map(x=>x.date)].filter(Boolean).map(x=>new Date(x));
      if (dates.length > 0) setCurrentDate(new Date(Math.max(...dates))); 
    } catch (err) { addLog(err.message, 'error'); } finally { setLoading(false); }
  };

  const operators = useMemo(() => Array.from(new Set([...data.chat.map(x => x.operator), ...data.form.map(x => x.operator)])).sort(), [data]);

  const periods = useMemo(() => {
    const startCurr = startOfWeek(currentDate, { weekStartsOn: 1 }); const endCurr = endOfWeek(currentDate, { weekStartsOn: 1 });
    const startPrev = subWeeks(startCurr, 1); const endPrev = subWeeks(endCurr, 1);
    return { curr: { start: startCurr, end: endCurr, label: `Sett. ${getISOWeek(currentDate)} (${format(startCurr, 'dd MMM')} - ${format(endCurr, 'dd MMM')})` }, prev: { start: startPrev, end: endPrev } };
  }, [currentDate]);

  const kpi = useMemo(() => {
    const calc = (start, end) => {
      const chatD = selectedOperator === 'all' ? data.chat : data.chat.filter(x => x.operator === selectedOperator);
      const formD = selectedOperator === 'all' ? data.form : data.form.filter(x => x.operator === selectedOperator);
      const astD = data.ast.filter(x => safeInRange(x.date, start, end));
      const devD = data.dev.filter(x => safeInRange(x.date, start, end));
      const inRangeChats = chatD.filter(x => safeInRange(x.import_date, start, end));
      const totalChat = inRangeChats.reduce((a,b)=>a+Number(b.chats_accepted),0);
      const avgResp = totalChat > 0 ? inRangeChats.reduce((a,b)=>a+(Number(b.avg_response_time||0)*Number(b.chats_accepted)),0) / totalChat : 0;
      const avgDur = totalChat > 0 ? inRangeChats.reduce((a,b)=>a+(Number(b.avg_duration||0)*Number(b.chats_accepted)),0) / totalChat : 0;
      const inRangeForm = formD.filter(x => safeInRange(x.date, start, end));
      const avgAstResp = astD.length > 0 ? astD.reduce((a,b)=>a+Number(b.first_response_time||0),0)/astD.length : 0;
      return { chat: totalChat, avg_resp: avgResp, avg_dur: avgDur, form: inRangeForm.length, form_hours: inRangeForm.reduce((a,b)=>a+Number(b.duration||0),0)/60, noshow: data.noshow[`${format(start, 'yyyy')}-W${String(getISOWeek(start)).padStart(2,'0')}`] || 0, ast_new: astD.reduce((a,b)=>a+Number(b.new_tickets),0), ast_closed: astD.reduce((a,b)=>a+Number(b.closed_tickets),0), ast_resp: avgAstResp, dev_backlog: devD.length > 0 ? Number(devD[devD.length-1].backlog) : 0, dev_res: devD.length > 0 ? devD.reduce((a,b)=>a+Number(b.resolution_time||0),0)/devD.length : 0 };
    };
    return { curr: calc(periods.curr.start, periods.curr.end), prev: calc(periods.prev.start, periods.prev.end) };
  }, [data, periods, selectedOperator]);

  const dailyMacroTrend = useMemo(() => {
    const s = startOfDay(periods.curr.start); const e = endOfDay(periods.curr.end);
    return eachDayOfInterval({ start: s, end: e }).map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const chatD = selectedOperator === 'all' ? data.chat : data.chat.filter(x => x.operator === selectedOperator);
      const chatVol = chatD.filter(x => x.import_date === dayStr).reduce((sum, x) => sum + Number(x.chats_accepted), 0);
      const formD = selectedOperator === 'all' ? data.form : data.form.filter(x => x.operator === selectedOperator);
      const formVol = formD.filter(x => format(parseISO(x.date), 'yyyy-MM-dd') === dayStr).length;
      const astVol = data.ast.filter(x => format(parseISO(x.date), 'yyyy-MM-dd') === dayStr).reduce((sum, x) => sum + Number(x.closed_tickets), 0);
      const devItems = data.dev.filter(x => format(parseISO(x.date), 'yyyy-MM-dd') === dayStr);
      return { date: format(day, 'EEE', {locale: it}), chat: Math.ceil(chatVol), form: formVol, ast: Math.ceil(astVol), dev: devItems.length > 0 ? Number(devItems[devItems.length - 1].backlog) : null };
    });
  }, [data, periods, selectedOperator]);

  const operatorFormations = useMemo(() => {
    if (selectedOperator === 'all') return [];
    return data.form.filter(f => f.operator === selectedOperator && safeInRange(f.date, periods.curr.start, periods.curr.end)).sort((a,b) => new Date(b.date) - new Date(a.date));
  }, [data, selectedOperator, periods]);

  const operatorStats = useMemo(() => {
    const stats = {}; data.chat.filter(x => safeInRange(x.import_date, periods.curr.start, periods.curr.end)).forEach(x => { stats[x.operator] = (stats[x.operator] || 0) + Number(x.chats_accepted); });
    return Object.entries(stats).map(([name, val]) => ({ name, val })).sort((a,b) => b.val - a.val).slice(0,10);
  }, [data, periods]);

  const leaderboard = useMemo(() => {
    const stats = {};
    data.chat.filter(x => safeInRange(x.import_date, periods.curr.start, periods.curr.end)).forEach(x => { if(!stats[x.operator]) stats[x.operator] = { chat: 0, form: 0 }; stats[x.operator].chat += Number(x.chats_accepted); });
    data.form.filter(x => safeInRange(x.date, periods.curr.start, periods.curr.end)).forEach(x => { if(!stats[x.operator]) stats[x.operator] = { chat: 0, form: 0 }; stats[x.operator].form += 1; });
    return Object.entries(stats).map(([name, val]) => ({ name, chat: val.chat, form: val.form, score: val.chat + (val.form * 10) })).sort((a,b) => b.score - a.score);
  }, [data, periods]);

  const astTrend = useMemo(() => {
    return data.ast.filter(x => safeInRange(x.date, periods.curr.start, periods.curr.end)).map(x => ({ date: format(parseISO(x.date), 'EEE', {locale:it}), new: x.new_tickets, closed: x.closed_tickets, time: x.first_response_time }));
  }, [data, periods]);

  const handleGenerateReport = () => { setIsGenerating(true); setTimeout(() => { setGeneratedReport(generateWeeklyReport(kpi, periods)); setIsGenerating(false); }, 1500); };
  const copyToClipboard = () => { if (generatedReport) { navigator.clipboard.writeText(generatedReport.text); alert("Testo copiato e pronto per la mail!"); } };

  // --- API ZOHO SYNC FUNCTION ---
  const syncZohoAPI = async () => {
    setLoading(true);
    addLog('Chiamata API Zoho in corso...', 'info');
    try {
      const res = await fetch('/.netlify/functions/syncZoho');
      const text = await res.text();
      let responseData;
      try { responseData = JSON.parse(text); } catch(e) { throw new Error("La funzione API non è raggiungibile o non è stata configurata correttamente."); }
      
      if (!res.ok || responseData.error) throw new Error(responseData.error || "Errore sconosciuto dal server");
      
      addLog('Sincronizzazione API riuscita!', 'success');
      alert("✅ Sincronizzazione Zoho completata con successo!");
      await fetchAll(); 
    } catch (err) {
      addLog(err.message, 'error');
      alert("Errore API: " + err.message + "\nAssicurati di aver creato la cartella netlify/functions/ e di aver fatto il deploy su GitHub.");
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (e, type) => {
    const file = e.target.files[0]; if (!file) return;
    try { const res = await parseExcel(file, type); setUploadModal({ type, rows: res.rows, file: file.name, range: res.range }); } catch (err) { alert(err.message); }
  };

  const confirmUpload = async () => {
    if (!uploadModal) return; setLoading(true);
    try {
      const { type, rows } = uploadModal; let table = '', conflict = '', dateCol = '', finalRows = rows, start, end;
      if (type === 'chat') {
        table = 'chat_performance'; conflict = 'import_date, operator'; dateCol = 'import_date';
        const sVal = document.getElementById('startDate')?.value; const eVal = document.getElementById('endDate')?.value;
        if (sVal && eVal) { start = new Date(sVal); end = new Date(eVal); } else if (uploadModal.range) { start = uploadModal.range.start; end = uploadModal.range.end; } else throw new Error("Range mancante");
        const days = eachDayOfInterval({ start, end }); finalRows = [];
        rows.forEach(r => { const dailyChat = Number(r.chats_accepted) / days.length; days.forEach(d => finalRows.push({ operator: r.operator, chats_accepted: dailyChat, hours_worked: r.hours_worked, avg_response_time: r.avg_response_time, avg_duration: r.avg_duration, import_date: format(d, 'yyyy-MM-dd') })); });
        setCurrentDate(start);
      }
      else if (type === 'formazioni') {
        table = 'formazioni'; conflict = 'id'; dateCol = 'date'; if (rows.length === 0) throw new Error("File vuoto");
        const dates = rows.map(r => parseISO(r.date)); start = min(dates); end = max(dates);
        const nsCount = document.getElementById('nsCount')?.value || 0;
        await supabase.from('manual_noshows').upsert({ week_id: `${format(start, 'yyyy')}-W${String(getISOWeek(start)).padStart(2,'0')}`, count: nsCount });
        setCurrentDate(start);
      }
      else {
        table = type === 'assistenza' ? 'ticket_assistenza' : 'ticket_sviluppo'; dateCol = 'date'; conflict = 'date';
        const dates = rows.map(r => parseISO(r.date)); start = min(dates); end = max(dates);
      }
      await supabase.from(table).delete().gte(dateCol, format(start, 'yyyy-MM-dd')).lte(dateCol, format(end, 'yyyy-MM-dd'));
      const CHUNK = 500; for (let i = 0; i < finalRows.length; i += CHUNK) await supabase.from(table).upsert(finalRows.slice(i, i + CHUNK), { onConflict: conflict });
      await fetchAll(); setUploadModal(null);
    } catch (err) { alert(err.message); } finally { setLoading(false); }
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
            <SidebarItem icon={ClipboardList} label="Formazioni" active={view === 'formazioni'} onClick={() => setView('formazioni')} />
            <SidebarItem icon={AlertCircle} label="Ticket Assistenza" active={view === 'assistenza'} onClick={() => setView('assistenza')} />
            <SidebarItem icon={Code} label="Ticket Sviluppo" active={view === 'sviluppo'} onClick={() => setView('sviluppo')} />
          </div>
        </div>
        <div className="p-4"><button onClick={() => setShowDebug(!showDebug)} className="text-slate-200 hover:text-slate-400 transition-colors"><Bug size={14}/></button></div>
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50 relative">
        <div className="bg-white/90 backdrop-blur-md border-b border-slate-200 px-8 py-4 flex justify-between items-center z-10 sticky top-0">
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
               <button onClick={() => setCurrentDate(subWeeks(currentDate,1))} className="p-1.5 hover:bg-white rounded-md shadow-sm transition-all"><ChevronLeft size={16}/></button>
               <span className="text-xs font-bold w-auto px-4 text-center uppercase tracking-wide text-slate-600">{periods.curr.label}</span>
               <button onClick={() => setCurrentDate(addWeeks(currentDate,1))} className="p-1.5 hover:bg-white rounded-md shadow-sm transition-all"><ChevronRight size={16}/></button>
             </div>
             <div className="flex items-center gap-2">
                <User size={16} className="text-slate-400" />
                <select className="bg-white border border-slate-200 text-sm rounded-lg p-1.5 outline-none font-medium text-slate-700 cursor-pointer" value={selectedOperator} onChange={(e) => setSelectedOperator(e.target.value)}><option value="all">Tutto il Team</option>{operators.map(op => <option key={op} value={op}>{op}</option>)}</select>
             </div>
          </div>
          {loading && <div className="flex items-center gap-2 text-indigo-600 text-xs font-bold animate-pulse"><Loader2 size={14} className="animate-spin"/> Sincronizzazione...</div>}
        </div>

        <div className="flex-1 overflow-auto p-8 pb-48">
          <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {view === 'dashboard' && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <ComparisonRow label="Chat Gestite" current={kpi.curr.chat} previous={kpi.prev.chat} />
                  <ComparisonRow label="Tempo Risp. Chat" current={kpi.curr.avg_resp} previous={kpi.prev.avg_resp} isTime={true} invert={true} />
                  <ComparisonRow label="Sessioni Formazione" current={kpi.curr.form} previous={kpi.prev.form} />
                  <ComparisonRow label="Ore Formazione" current={kpi.curr.form_hours * 60} previous={kpi.prev.form_hours * 60} isTime={true} />
                  <ComparisonRow label="Ticket Chiusi (Ast)" current={kpi.curr.ast_closed} previous={kpi.prev.ast_closed} isTeamMetric={true} />
                  <ComparisonRow label="Tempo Risp. Ticket" current={kpi.curr.ast_resp} previous={kpi.prev.ast_resp} isTime={true} invert={true} isTeamMetric={true} />
                  <ComparisonRow label="Backlog Sviluppo" current={kpi.curr.dev_backlog} previous={kpi.prev.dev_backlog} invert={true} isTeamMetric={true} />
                  <ComparisonRow label="No-Show Formazione" current={kpi.curr.noshow} previous={kpi.prev.noshow} invert={true} isTeamMetric={true} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
                  <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl p-6 border border-indigo-100 shadow-sm relative overflow-hidden"><div className="absolute top-0 right-0 p-10 opacity-[0.03] text-indigo-600"><Sparkles size={120}/></div><div className="flex justify-between items-center mb-6 relative z-10"><div className="flex items-center gap-3"><div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600"><Mail size={20}/></div><div><h3 className="font-bold text-slate-800">Bollettino Manageriale</h3><p className="text-xs text-slate-500">Analisi AI Narrativa</p></div></div><div className="flex gap-2">{!generatedReport && <button onClick={handleGenerateReport} disabled={isGenerating} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-all shadow-md active:scale-95">{isGenerating ? <Loader2 className="animate-spin" size={14}/> : <Sparkles size={14} />} Genera Analisi</button>}{generatedReport && <button onClick={copyToClipboard} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-all"><Copy size={14} /> Copia Testo Email</button>}</div></div>{generatedReport ? (<div className="space-y-4 relative z-10 animate-in fade-in slide-in-from-bottom-2 text-slate-700"><div dangerouslySetInnerHTML={{ __html: generatedReport.html }} /></div>) : (<div className="h-32 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-100 rounded-xl"><Info size={24} className="mb-2 opacity-50"/><p className="text-xs">Clicca "Genera Analisi" per creare il report discorsivo</p></div>)}</div>
                    {selectedOperator !== 'all' && (<div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm"><h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><ClipboardList size={16}/> Registro Formazioni ({selectedOperator})</h4><div className="overflow-hidden rounded-lg border border-slate-100"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 font-medium"><tr><th className="px-4 py-2">Data</th><th className="px-4 py-2">Argomento</th><th className="px-4 py-2 text-right">Minuti</th></tr></thead><tbody className="divide-y divide-slate-100">{operatorFormations.length > 0 ? operatorFormations.map((f, i) => (<tr key={i} className="hover:bg-slate-50/50"><td className="px-4 py-3 font-medium text-slate-700">{format(new Date(f.date), 'dd MMM')}</td><td className="px-4 py-3 text-slate-600 truncate max-w-xs" title={f.topic}>{f.topic}</td><td className="px-4 py-3 text-right font-mono text-xs bg-slate-50 text-indigo-600 font-bold">{f.duration}</td></tr>)) : <tr><td colSpan="3" className="px-4 py-8 text-center text-slate-400 italic">Nessuna formazione registrata.</td></tr>}</tbody></table></div></div>)}
                  </div>
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm h-full flex flex-col" style={{minHeight: '400px'}}>
                    <h3 className="font-bold text-slate-800 mb-4 text-sm uppercase tracking-wide flex items-center gap-2"><TrendingUp size={16}/> {selectedOperator === 'all' ? 'Top Performers' : 'Profilo Utente'}</h3>
                    {selectedOperator === 'all' ? (<div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">{leaderboard.length > 0 ? leaderboard.map((op, idx) => <LeaderboardRow key={op.name} rank={idx + 1} name={op.name} chats={op.chat} formations={op.form} score={op.score} />) : <div className="text-center text-slate-400 mt-10 text-xs">Nessun dato in questa settimana.</div>}</div>) : (<div className="text-center p-4"><div className="w-20 h-20 mx-auto rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-3xl font-bold mb-4">{selectedOperator.charAt(0)}</div><h3 className="text-xl font-bold text-slate-900">{selectedOperator}</h3><p className="text-xs text-slate-500 uppercase tracking-widest mb-6">Support Specialist</p><div className="w-full bg-slate-50 p-4 rounded-xl mb-2 border border-slate-100"><p className="text-xs text-slate-400 font-bold uppercase">Volume Chat</p><p className="text-2xl font-bold text-indigo-600">{formatNumber(kpi.curr.chat)}</p></div><div className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100"><p className="text-xs text-slate-400 font-bold uppercase">Ore Formazione</p><p className="text-2xl font-bold text-purple-600">{formatTime(kpi.curr.form_hours * 60)}</p></div></div>)}
                  </div>
                </div>
                <div className="mt-6"><ChartContainer title={`Andamento Operativo Giornaliero (${selectedOperator === 'all' ? 'Vista Globale' : 'Focus Operatore'})`} isEmpty={dailyMacroTrend.every(x => x.chat === 0 && x.ast === 0 && x.form === 0)}><ComposedChart data={dailyMacroTrend}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill:'#64748b', fontSize:12, textTransform: 'capitalize'}} /><YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fill:'#64748b', fontSize:12}} />{selectedOperator === 'all' && <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fill:'#64748b', fontSize:12}} />}<Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius:'8px', border:'none', boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}} /><Legend wrapperStyle={{paddingTop:'10px'}} /><Bar yAxisId="left" dataKey="chat" name="Chat Gestite" fill="#6366f1" radius={[4,4,0,0]} barSize={20} /><Bar yAxisId="left" dataKey="form" name="Formazioni" fill="#8b5cf6" radius={[4,4,0,0]} barSize={20} />{selectedOperator === 'all' && <Bar yAxisId="left" dataKey="ast" name="Ticket Chiusi" fill="#10b981" radius={[4,4,0,0]} barSize={20} />}{selectedOperator === 'all' && <Line yAxisId="right" connectNulls type="monotone" dataKey="dev" name="Backlog Sviluppo" stroke="#f59e0b" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />}</ComposedChart></ChartContainer></div>
              </>
            )}

            {/* VISTE TICKET: ORA HANNO IL BOTTONE API VERDE! */}
            {(view === 'assistenza' || view === 'sviluppo') && (
              <>
                <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 capitalize">Ticket {view}</h2>
                    <p className="text-slate-500 text-sm mt-1">Connesso a Zoho Desk API</p>
                  </div>
                  <div className="flex gap-3">
                    {/* Vecchio tasto Importa (nascosto o secondario) */}
                    <label className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer text-sm font-bold transition-colors"><Upload size={16} /> Caricamento Manuale<input type="file" className="hidden" onChange={(e) => handleFile(e, view)} /></label>
                    {/* NUOVO TASTO API MAGICO */}
                    <button onClick={syncZohoAPI} className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md rounded-lg cursor-pointer text-sm font-bold transition-all hover:scale-105 active:scale-95">
                      <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Sincronizza Dati di Oggi
                    </button>
                  </div>
                </div>
                
                {view === 'assistenza' && (
                  <ChartContainer title="Tempo Risposta vs Volumi (Assistenza)" isEmpty={astTrend.length === 0}><ComposedChart data={astTrend}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{textTransform: 'capitalize'}} /><YAxis yAxisId="left" /><YAxis yAxisId="right" orientation="right" unit="m" /><Tooltip /><Bar yAxisId="left" dataKey="closed" fill="#6366f1" radius={[4,4,0,0]} name="Ticket Chiusi" barSize={40}/><Line yAxisId="right" type="monotone" dataKey="time" stroke="#f59e0b" strokeWidth={3} name="Tempo Risposta (min)" /></ComposedChart></ChartContainer>
                )}
              </>
            )}

            {/* VISTE CHAT E FORMAZIONI (Rimangono manuali) */}
            {(view === 'chat' || view === 'formazioni') && (
              <>
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-slate-900 capitalize">Area {view}</h2>
                  <label className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg cursor-pointer text-sm font-bold"><Upload size={16} /> Importa {view}<input type="file" className="hidden" onChange={(e) => handleFile(e, view)} /></label>
                </div>
                {view === 'chat' && <ChartContainer title="Analisi Chat Operatori" isEmpty={operatorStats.length===0}><BarChart data={operatorStats} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={100} /><Tooltip/><Bar dataKey="val" fill="#6366f1" radius={[0,4,4,0]} barSize={20}/></BarChart></ChartContainer>}
              </>
            )}
          </div>
        </div>
      </div>

      <div className={`fixed bottom-0 left-0 right-0 h-32 bg-slate-900 text-slate-400 p-2 text-xs font-mono transition-transform duration-300 z-50 ${showDebug ? 'translate-y-0' : 'translate-y-full'}`}><div className="flex justify-between border-b border-slate-700 pb-1 mb-1"><span className="font-bold text-white">LOG SISTEMA</span><button onClick={()=>setShowDebug(false)}>✕</button></div><div className="h-full overflow-y-auto">{logs.map((l,i)=><div key={i}>[{format(l.time,'HH:mm:ss')}] {l.msg}</div>)}</div></div>

      {uploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white p-8 rounded-3xl w-full max-w-lg shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2"><Upload size={20} className="text-indigo-600"/> Conferma Importazione</h3>
            <p className="text-sm text-slate-500 mb-6">File: <b>{uploadModal.file}</b> ({uploadModal.rows.length} righe)</p>
            {uploadModal.type === 'chat' && !uploadModal.range && <div className="grid grid-cols-2 gap-3 mb-6"><input id="startDate" type="date" className="border p-2 rounded-lg w-full" /><input id="endDate" type="date" className="border p-2 rounded-lg w-full" /></div>}
            {uploadModal.type === 'formazioni' && <div className="mb-6 flex justify-between items-center bg-rose-50 p-3 rounded-lg border border-rose-100"><span className="text-rose-700 font-bold text-sm">Ore No-Show Totali</span><input id="nsCount" type="number" defaultValue="0" className="w-20 p-1 text-center font-bold border rounded bg-white" /></div>}
            <div className="flex justify-end gap-3"><button onClick={() => setUploadModal(null)} className="px-5 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-lg">Annulla</button><button onClick={confirmUpload} className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700">Procedi</button></div>
          </div>
        </div>
      )}
    </div>
  );
}