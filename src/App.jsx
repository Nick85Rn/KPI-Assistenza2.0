/* eslint-disable */
import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { 
  Database, Users, AlertCircle, Code, LayoutDashboard, 
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, 
  RefreshCw, X, FileText, ClipboardCheck, Trophy, Target, Clock, Tag, Bug, Zap, CheckCircle2, Copy, UploadCloud, GraduationCap, Timer
} from 'lucide-react';
import { 
  format, subWeeks, addWeeks, startOfWeek, endOfWeek, 
  startOfMonth, endOfMonth, subMonths, addMonths,
  isWithinInterval, getISOWeek, eachDayOfInterval, startOfDay, endOfDay 
} from 'date-fns';
import { it } from 'date-fns/locale'; 
import { supabase } from './supabaseClient';

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#64748b'];

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
  const [timeframe, setTimeframe] = useState('week'); 
  const [data, setData] = useState({ chat: [], ast: [], dev: [], form: [] });
  const [loading, setLoading] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [generatedReport, setGeneratedReport] = useState(null);
  const [copied, setCopied] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const fetchPaginated = async (table) => {
        try {
          let allRecords = [];
          let from = 0;
          const step = 1000;
          while (true) {
            const { data, error } = await supabase.from(table).select('*').range(from, from + step - 1);
            if (error) throw error;
            allRecords = [...allRecords, ...data];
            if (data.length < step) break; 
            from += step;
          }
          return allRecords;
        } catch (e) {
          console.warn(`Tabella ${table} non trovata o vuota:`, e.message);
          return [];
        }
      };

      const [c, a, d, f] = await Promise.all([
        fetchPaginated('zoho_raw_chats'),
        fetchPaginated('zoho_raw_assistenza'),
        fetchPaginated('zoho_raw_sviluppo'),
        fetchPaginated('zoho_raw_formazione')
      ]);

      setData({ chat: c, ast: a, dev: d, form: f });
      setLastUpdated(new Date());
    } catch (err) { 
      console.error(err); 
      alert("Errore caricamento dati: " + err.message);
    } finally { 
      setLoading(false); 
    }
  };

  const parseCSVAdvanced = (csvText) => {
    const rows = []; let currentRow = []; let currentCell = ''; let inQuotes = false;
    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i]; const nextChar = csvText[i + 1];
      if (inQuotes) {
        if (char === '"' && nextChar === '"') { currentCell += '"'; i++; } 
        else if (char === '"') { inQuotes = false; } 
        else { currentCell += char; }
      } else {
        if (char === '"') { inQuotes = true; } 
        else if (char === ',') { currentRow.push(currentCell.trim()); currentCell = ''; } 
        else if (char === '\n' || char === '\r') {
          if (char === '\r' && nextChar === '\n') i++; 
          currentRow.push(currentCell.trim());
          if (currentRow.length > 1 || currentRow[0] !== '') { rows.push(currentRow); }
          currentRow = []; currentCell = '';
        } else { currentCell += char; }
      }
    }
    if (currentRow.length > 0 || currentCell !== '') { currentRow.push(currentCell.trim()); rows.push(currentRow); }
    return rows;
  };

  const handleChatImport = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target.result;
      if (text.includes("Brand Performance") || text.includes("Chats Owned")) {
        alert("🛑 ALT! File errato. Usa il file 'Cronologia' delle chat!"); e.target.value = ''; return;
      }
      try {
        setLoading(true);
        const parsedRows = parseCSVAdvanced(text);
        let headerIdx = -1;
        for (let i = 0; i < Math.min(15, parsedRows.length); i++) {
          if (parsedRows[i].some(col => col.includes('ID della conversazione'))) { headerIdx = i; break; }
        }
        if (headerIdx === -1) throw new Error("Intestazioni non trovate.");
        const headers = parsedRows[headerIdx]; const records = [];
        for (let i = headerIdx + 1; i < parsedRows.length; i++) {
          const values = parsedRows[i]; if (values.length < 5) continue; 
          const getVal = (col) => { const idx = headers.indexOf(col); return idx !== -1 ? values[idx] : null; };
          const chatId = getVal('ID della conversazione'); if (!chatId) continue;
          records.push({
            chat_id: chatId, operator: getVal('Partecipante') || 'Bot',
            created_time: getVal('Ora di creazione (in millisecondi)') ? new Date(Number(getVal('Ora di creazione (in millisecondi)'))).toISOString() : null,
            closed_time: getVal('Ora di fine (in millisecondi)') ? new Date(Number(getVal('Ora di fine (in millisecondi)'))).toISOString() : null,
            waiting_time_seconds: Number(getVal('Risposta da parte del primo agente dopo (in secondi)')) || 0
          });
        }
        for (let i = 0; i < records.length; i += 1000) {
            const chunk = records.slice(i, i + 1000);
            await supabase.from('zoho_raw_chats').upsert(chunk, { onConflict: 'chat_id' });
        }
        alert("✅ Chat importate con successo!"); fetchAll(); 
      } catch (err) { alert("❌ Errore: " + err.message); } finally { setLoading(false); e.target.value = ''; }
    };
    reader.readAsText(file);
  };

  const handleFormazioneImport = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target.result;
      try {
        setLoading(true);
        const parsedRows = parseCSVAdvanced(text);
        
        let headerIdx = -1;
        for (let i = 0; i < Math.min(10, parsedRows.length); i++) {
          if (parsedRows[i].some(col => col.includes('Durata Formazione'))) { headerIdx = i; break; }
        }
        if (headerIdx === -1) throw new Error("Intestazioni non trovate. Assicurati che sia il 'Report Assistenza Tecnica_per operatore.csv'.");

        const headers = parsedRows[headerIdx];
        const records = [];

        const parseItalianDate = (dateStr) => {
          if (!dateStr) return null;
          const months = { 'gen': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'mag': 4, 'giu': 5, 'lug': 6, 'ago': 7, 'set': 8, 'ott': 9, 'nov': 10, 'dic': 11 };
          const match = dateStr.match(/([a-z]{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})/i);
          if (match) {
            const [, month, day, year, hour, minute] = match;
            const m = months[month.toLowerCase()];
            if (m !== undefined) return new Date(year, m, day, hour, minute).toISOString();
          }
          return null;
        };

        const classifyTopic = (title, desc) => {
          const t = (title + " " + desc).toLowerCase();
          if (t.includes('voice pro') || t.includes('centralino')) return 'Centralino / Voice Pro';
          if (t.includes('api') || t.includes('whatsapp') || t.includes('wa')) return 'WhatsApp API';
          if (t.includes('app clienti') || t.includes('app lite') || t.includes('build')) return 'App Clienti';
          if (t.includes('magazzino')) return 'Gestione Magazzino';
          if (t.includes('fidelity') || t.includes('marketing') || t.includes('template') || t.includes('portfolio')) return 'Marketing & Fidelity';
          if (t.includes('bug') || t.includes('lavori') || t.includes('assistenza')) return 'Assistenza Pura';
          return 'Formazione Generale';
        };

        for (let i = headerIdx + 1; i < parsedRows.length; i++) {
          const values = parsedRows[i]; if (values.length < 5) continue; 
          const getVal = (col) => { const idx = headers.findIndex(h => h.includes(col)); return idx !== -1 ? values[idx] : ''; };

          const title = getVal('Nome Nota Reparto Tecnico');
          const company = getVal('Azienda');
          const creator = getVal('Creato da') || getVal('Proprietario di Nota Reparto Tecnico');
          const desc = getVal('Descrizione');
          const duration = parseInt(getVal('Durata Formazione (in minuti)'), 10) || 0;
          const createdAt = getVal('Ora creazione');
          
          if (!title && !company) continue;

          records.push({
            topic: classifyTopic(title, desc),
            original_title: title,
            company: company,
            operator: creator,
            description: desc,
            duration_minutes: duration,
            created_time: parseItalianDate(createdAt) || new Date().toISOString()
          });
        }

        if (records.length === 0) throw new Error("Nessuna riga valida trovata.");

        for (let i = 0; i < records.length; i += 500) {
            const chunk = records.slice(i, i + 500);
            await supabase.from('zoho_raw_formazione').insert(chunk);
        }

        alert(`✅ IMPORTAZIONE COMPLETATA!\n\nSono state classificate ed elaborate ${records.length} sessioni di formazione.`);
        fetchAll(); 

      } catch (err) { alert("❌ Errore Formazione: " + err.message); } finally { setLoading(false); e.target.value = ''; }
    };
    reader.readAsText(file);
  };

  const handlePrevPeriod = () => setCurrentDate(prev => timeframe === 'week' ? subWeeks(prev, 1) : subMonths(prev, 1));
  const handleNextPeriod = () => setCurrentDate(prev => timeframe === 'week' ? addWeeks(prev, 1) : addMonths(prev, 1));

  const periods = useMemo(() => {
    if (timeframe === 'week') {
      const s = startOfWeek(currentDate, { weekStartsOn: 1 });
      const e = endOfWeek(currentDate, { weekStartsOn: 1 });
      return { curr: { start: s, end: e, label: `Sett. ${getISOWeek(currentDate)} (${format(s, 'dd MMM', {locale: it})} - ${format(e, 'dd MMM', {locale: it})})` }, prev: { start: subWeeks(s, 1), end: subWeeks(e, 1) } };
    } else {
      const s = startOfMonth(currentDate);
      const e = endOfMonth(currentDate);
      return { curr: { start: s, end: e, label: format(currentDate, 'MMMM yyyy', {locale: it}).toUpperCase() }, prev: { start: subMonths(s, 1), end: subMonths(e, 1) } };
    }
  }, [currentDate, timeframe]);

  const kpi = useMemo(() => {
    const calc = (start, end) => {
      const chats = data.chat.filter(x => safeInRange(x.created_time, start, end));
      const astOut = data.ast.filter(x => safeInRange(x.closed_time, start, end));
      const devOut = data.dev.filter(x => safeInRange(x.closed_time, start, end));
      const forms = data.form.filter(x => safeInRange(x.created_time, start, end));

      return { 
        chatVol: chats.length, 
        chatWait: chats.length > 0 ? chats.reduce((a,b) => a + (Number(b.waiting_time_seconds)||0), 0) / chats.length : 0, 
        astIn: data.ast.filter(x => safeInRange(x.created_time, start, end)).length, 
        astOut: astOut.length, 
        slaAst: astOut.length > 0 ? astOut.reduce((a,x) => a + diffInMinutes(x.closed_time, x.created_time), 0) / astOut.length : 0, 
        backlog: data.dev.filter(x => !x.status?.toLowerCase().includes('chius')).length,
        devOut: devOut.length,
        formCount: forms.length,
        formMins: forms.reduce((a,b) => a + (Number(b.duration_minutes)||0), 0)
      };
    };
    return { curr: calc(periods.curr.start, periods.curr.end), prev: calc(periods.prev.start, periods.prev.end) };
  }, [data, periods]);

  const insightsFormazione = useMemo(() => {
    const forms = data.form.filter(x => safeInRange(x.created_time, periods.curr.start, periods.curr.end));
    const opsMap = {}; const topicMap = {};
    forms.forEach(f => {
      const op = f.operator || 'Sconosciuto'; const t = f.topic || 'Generale'; const dur = Number(f.duration_minutes) || 0;
      if (!opsMap[op]) opsMap[op] = { name: op, count: 0, mins: 0 };
      opsMap[op].count++; opsMap[op].mins += dur;
      if (!topicMap[t]) topicMap[t] = { name: t, count: 0, mins: 0 };
      topicMap[t].count++; topicMap[t].mins += dur;
    });
    return { topOps: Object.values(opsMap).sort((a,b) => b.mins - a.mins), topTopics: Object.values(topicMap).sort((a,b) => b.count - a.count) };
  }, [data.form, periods.curr]);

  const insights = useMemo(() => {
    const chats = data.chat.filter(x => safeInRange(x.created_time, periods.curr.start, periods.curr.end));
    const opsMap = {};
    chats.forEach(c => {
       const op = c.operator || 'Non Assegnato';
       if(!opsMap[op]) opsMap[op] = { name: op, count: 0, waitSum: 0 };
       opsMap[op].count++; opsMap[op].waitSum += (Number(c.waiting_time_seconds)||0);
    });
    const allOps = Object.values(opsMap).map(o => ({ name: o.name, count: o.count, avgWait: o.count > 0 ? o.waitSum / o.count : 0 })).sort((a,b) => b.count - a.count);
    const ast = data.ast.filter(x => safeInRange(x.created_time, periods.curr.start, periods.curr.end));
    const astCatMap = {}; ast.forEach(t => { const c = t.category || 'Generale'; astCatMap[c] = (astCatMap[c]||0) + 1; });
    const devCatsMap = {}; data.dev.filter(x => !x.status?.toLowerCase().includes('chius')).forEach(t => { const c = t.category || 'Generale'; devCatsMap[c] = (devCatsMap[c]||0) + 1; });

    return { 
      allOps, topOps: allOps.slice(0, 4), 
      allAstCats: Object.entries(astCatMap).map(([name, count]) => ({name, count})).sort((a,b) => b.count - a.count), 
      allDevCats: Object.entries(devCatsMap).map(([name, count]) => ({name, count})).sort((a,b) => b.count - a.count) 
    };
  }, [data, periods.curr]);

  const trends = useMemo(() => {
    return eachDayOfInterval({ start: periods.curr.start, end: periods.curr.end }).map(day => {
      const dStart = startOfDay(day); const dEnd = endOfDay(day);
      const dateLabel = timeframe === 'week' ? format(day, 'EEE', {locale: it}) : format(day, 'd MMM', {locale: it});
      return {
        date: dateLabel,
        chatVol: data.chat.filter(x => safeInRange(x.created_time, dStart, dEnd)).length,
        astIn: data.ast.filter(x => safeInRange(x.created_time, dStart, dEnd)).length,
        astOut: data.ast.filter(x => safeInRange(x.closed_time, dStart, dEnd)).length,
        devIn: data.dev.filter(x => safeInRange(x.created_time, dStart, dEnd)).length,
        devOut: data.dev.filter(x => safeInRange(x.closed_time, dStart, dEnd)).length,
      };
    });
  }, [data, periods.curr, timeframe]);

  const handleGenerateReport = () => {
    const c = kpi.curr; const p = kpi.prev;
    const periodName = timeframe === 'week' ? 'In questa settimana' : 'In questo mese';
    const periodLabelPrec = timeframe === 'week' ? 'sett. prec.' : 'mese prec.';

    const formatTrend = (curr, prev, formatter, invert = false) => {
        const diff = curr - prev;
        if (diff === 0) return `➖ Stabile`;
        const isGood = invert ? diff < 0 : diff > 0;
        const sign = diff > 0 ? '+' : '-';
        const icon = isGood ? '🟢' : '🔴';
        const absVal = formatter ? formatter(Math.abs(diff)) : Math.abs(diff);
        return `${icon} ${sign} ${absVal}`;
    };

    const reportText = `📊 REPORT DIREZIONALE PIENISSIMO
🗓️ Periodo: ${periods.curr.label}

📝 SINTESI GENERALE:
${periodName} il team ha gestito ${c.chatVol} chat (attesa media ${formatSeconds(c.chatWait)}) ed erogato ${c.formCount} sessioni di formazione ai clienti per un totale di ${formatTime(c.formMins)}.
L'Assistenza ha ricevuto ${c.astIn} nuovi ticket, chiudendone ${c.astOut} (SLA: ${formatTime(c.slaAst)}). 
Il team Sviluppo ha corretto ${c.devOut} bug (Backlog attivo: ${c.backlog}).

⚡ INDICATORI CHIAVE E TREND (VS ${periodLabelPrec.toUpperCase()}):

💬 REPARTO CHAT
• Volumi Gestiti: ${c.chatVol}  (${formatTrend(c.chatVol, p.chatVol, null)})
• Tempo Attesa: ${formatSeconds(c.chatWait)}  (${formatTrend(c.chatWait, p.chatWait, formatSeconds, true)})

🎓 FORMAZIONE
• Sessioni: ${c.formCount}  (${formatTrend(c.formCount, p.formCount, null)})
• Ore Totali: ${formatTime(c.formMins)}  (${formatTrend(c.formMins, p.formMins, formatTime)})

🛠️ SUPPORTO TECNICO
• Ticket Chiusi: ${c.astOut}  (${formatTrend(c.astOut, p.astOut, null)})
• SLA Risoluzione: ${formatTime(c.slaAst)}  (${formatTrend(c.slaAst, p.slaAst, formatTime, true)})
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
            {[ 
              { id: 'dashboard', icon: LayoutDashboard, label: 'Panoramica' }, 
              { id: 'chat', icon: Users, label: 'Reparto Chat' }, 
              { id: 'formazione', icon: GraduationCap, label: 'Formazione' },
              { id: 'assistenza', icon: AlertCircle, label: 'Assistenza' }, 
              { id: 'sviluppo', icon: Code, label: 'Sviluppo' }
            ].map(item => (
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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
              <button onClick={() => setTimeframe('week')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${timeframe === 'week' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>Settimana</button>
              <button onClick={() => setTimeframe('month')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${timeframe === 'month' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>Mese</button>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-inner">
              <button onClick={handlePrevPeriod} className="p-1.5 hover:bg-white rounded-lg transition-all"><ChevronLeft size={16}/></button>
              <span className="text-xs font-black px-4 uppercase tracking-widest text-slate-700">{periods.curr.label}</span>
              <button onClick={handleNextPeriod} className="p-1.5 hover:bg-white rounded-lg transition-all"><ChevronRight size={16}/></button>
            </div>
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
            
            {/* NUOVO DESIGN REPORT EXECUTIVE (CHIARO E MODERNO) */}
            {generatedReport && (
              <div className="bg-white rounded-3xl p-8 relative shadow-2xl shadow-slate-200/50 mb-8 border border-slate-200/80 ring-1 ring-slate-900/5 animate-in fade-in slide-in-from-top-4">
                <button onClick={() => setGeneratedReport(null)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-700 transition-colors bg-slate-50 hover:bg-slate-100 p-2 rounded-full">
                  <X size={18}/>
                </button>
                
                <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-50 border border-blue-100 p-2.5 rounded-xl">
                      <ClipboardCheck size={22} className="text-blue-600"/>
                    </div>
                    <h3 className="font-bold uppercase text-sm tracking-widest text-slate-800">Report per la Direzione</h3>
                  </div>
                  <button onClick={copyToClipboard} className="flex items-center gap-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/20 mr-12">
                    {copied ? <CheckCircle2 size={16} className="text-white"/> : <Copy size={16}/>} {copied ? 'Copiato negli appunti!' : 'Copia Testo Report'}
                  </button>
                </div>
                
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100/80 text-slate-700 font-medium text-[15px] leading-relaxed whitespace-pre-wrap font-sans">
                  {generatedReport}
                </div>
              </div>
            )}

            {/* VISTA DASHBOARD GLOBALE */}
            {view === 'dashboard' && (
              <div className="space-y-10">
                {/* Reparto Chat */}
                <section>
                  <SectionTitle icon={Users} title="Performance Chat" colorClass="text-blue-600" bgClass="bg-blue-100" />
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <KPICard label="Chat Gestite" current={kpi.curr.chatVol} previous={kpi.prev.chatVol} icon={Target} colorClass="text-blue-500" />
                      <KPICard label="Attesa Media" current={kpi.curr.chatWait} previous={kpi.prev.chatWait} type="seconds" invert icon={Clock} colorClass="text-blue-500" />
                    </div>
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col cursor-pointer hover:border-blue-200" onClick={() => setView('chat')}>
                      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Trophy size={14} className="text-amber-500"/> Top Operatori (Chat)</h3>
                      <div className="flex-1 space-y-3">
                        {insights.topOps.length === 0 ? <p className="text-xs text-slate-400">Nessun dato</p> : 
                          insights.topOps.map((op, i) => (
                            <div key={i} className="flex justify-between items-center pb-2 border-b border-slate-50 last:border-0">
                              <div><span className="text-sm font-bold text-slate-800">{op.name}</span><div className="text-[10px] text-slate-500 mt-0.5">Attesa media: {formatSeconds(op.avgWait)}</div></div>
                              <span className="bg-blue-50 text-blue-700 font-black text-xs px-2 py-1 rounded-md">{op.count} chat</span>
                            </div>
                          ))}
                      </div>
                      <div className="mt-3 text-center text-[10px] font-bold text-blue-500 uppercase tracking-wider">Vedi Leaderboard &rarr;</div>
                    </div>
                  </div>
                </section>

                <section>
                  <SectionTitle icon={GraduationCap} title="Formazione Clienti" colorClass="text-purple-600" bgClass="bg-purple-100" />
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <KPICard label="Sessioni Erogate" current={kpi.curr.formCount} previous={kpi.prev.formCount} icon={GraduationCap} colorClass="text-purple-500" />
                      <KPICard label="Ore Totali" current={kpi.curr.formMins} previous={kpi.prev.formMins} type="time" icon={Timer} colorClass="text-purple-500" />
                    </div>
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col cursor-pointer hover:border-purple-200" onClick={() => setView('formazione')}>
                      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Tag size={14} className="text-purple-500"/> Classifica Formatori</h3>
                      <div className="flex-1 space-y-3">
                        {insightsFormazione.topOps.length === 0 ? <p className="text-xs text-slate-400">Nessun dato</p> : 
                          insightsFormazione.topOps.slice(0,3).map((op, i) => (
                          <div key={i} className="flex justify-between items-center pb-2 border-b border-slate-50 last:border-0">
                            <span className="text-sm font-bold text-slate-800">{op.name}</span>
                            <span className="bg-purple-50 text-purple-700 font-black text-xs px-2 py-1 rounded-md">{formatTime(op.mins)} ({op.count} appt)</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 text-center text-[10px] font-bold text-purple-500 uppercase tracking-wider">Vedi Analisi &rarr;</div>
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
                        {insights.allAstCats.length === 0 ? <p className="text-xs text-slate-400">Nessun ticket</p> : 
                          insights.allAstCats.slice(0,4).map((cat, i) => (
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
                        {insights.allDevCats.length === 0 ? <p className="text-xs text-emerald-500 font-bold">Nessun bug aperto! 🎉</p> : 
                          insights.allDevCats.slice(0,4).map((cat, i) => (
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
                
                <div className="bg-slate-900 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between shadow-lg mb-6 border border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="bg-blue-500/20 p-3 rounded-xl">
                      {loading ? <RefreshCw size={24} className="text-blue-400 animate-spin"/> : <UploadCloud size={24} className="text-blue-400"/>}
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-sm md:text-base">Carica Storico Chat</h3>
                      <p className="text-slate-400 text-xs mt-1">Carica il file CSV "Cronologia" esportato da Zoho.</p>
                    </div>
                  </div>
                  <label className={`mt-4 md:mt-0 flex items-center gap-2 px-6 py-3 ${loading ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow-md shadow-blue-900/50'} rounded-xl text-sm font-bold transition-all`}>
                    <FileText size={16} /> {loading ? 'Elaborazione in corso...' : 'Seleziona CSV'}
                    <input type="file" accept=".csv" className="hidden" onChange={handleChatImport} disabled={loading} />
                  </label>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <ChartContainer title={`Trend Volumi Giornalieri (${timeframe === 'month' ? 'Mensile' : 'Settimanale'})`} isEmpty={trends.every(t => t.chatVol === 0)}>
                      <BarChart data={trends} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize:10, fill:'#64748b', textTransform:'capitalize'}} interval={timeframe === 'month' ? 'preserveStartEnd' : 0} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b'}} />
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="chatVol" fill="#3b82f6" radius={[4,4,0,0]} name="Chat Gestite" barSize={timeframe === 'month' ? 12 : 40}/>
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

            {/* DETTAGLIO: FORMAZIONE */}
            {view === 'formazione' && (
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <SectionTitle icon={GraduationCap} title="Analisi Dettagliata Formazione" colorClass="text-purple-600" bgClass="bg-purple-100" />
                
                <div className="bg-slate-900 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between shadow-lg mb-6 border border-slate-800">
                  <div className="flex items-center gap-4">
                    <div className="bg-purple-500/20 p-3 rounded-xl">
                      {loading ? <RefreshCw size={24} className="text-purple-400 animate-spin"/> : <UploadCloud size={24} className="text-purple-400"/>}
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-sm md:text-base">Carica Report Formazioni</h3>
                      <p className="text-slate-400 text-xs mt-1">Carica il CSV "Report Assistenza Tecnica_per operatore". Verrà analizzato e classificato.</p>
                    </div>
                  </div>
                  <label className={`mt-4 md:mt-0 flex items-center gap-2 px-6 py-3 ${loading ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-md shadow-purple-900/50'} rounded-xl text-sm font-bold transition-all`}>
                    <FileText size={16} /> {loading ? 'Elaborazione in corso...' : 'Seleziona CSV'}
                    <input type="file" accept=".csv" className="hidden" onChange={handleFormazioneImport} disabled={loading} />
                  </label>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <ChartContainer title={`Classificazione Argomenti Trattati (${timeframe === 'month' ? 'Mese' : 'Settimana'})`} isEmpty={insightsFormazione.topTopics.length === 0}>
                      {/* GRAFICO A TORTA RIDIMENSIONATO */}
                      <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <Pie 
                          data={insightsFormazione.topTopics} 
                          cx="50%" cy="50%" 
                          innerRadius={60} 
                          outerRadius={90} 
                          paddingAngle={5} 
                          dataKey="count" 
                          nameKey="name" 
                          label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {insightsFormazione.topTopics.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                      </PieChart>
                    </ChartContainer>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-[320px]">
                    <h3 className="font-bold text-slate-800 mb-4 flex-shrink-0 text-sm uppercase tracking-wide flex items-center gap-2"><Trophy size={16} className="text-purple-500"/> Ore per Operatore</h3>
                    <div className="flex-1 overflow-auto pr-2 space-y-2">
                      {insightsFormazione.topOps.length === 0 ? <p className="text-xs text-slate-400 text-center mt-10">Nessuna formazione registrata</p> :
                        insightsFormazione.topOps.map((op, i) => (
                          <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div>
                              <p className="text-sm font-bold text-slate-800">{op.name}</p>
                              <p className="text-[10px] font-medium text-slate-500 mt-0.5">{op.count} appuntamenti</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-purple-600">{formatTime(op.mins)}</p>
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
                    <ChartContainer title={`Rapporto Ticket Creati vs Risolti (${timeframe === 'month' ? 'Mensile' : 'Settimanale'})`} isEmpty={trends.every(t => view === 'assistenza' ? (t.astIn === 0 && t.astOut === 0) : (t.devIn === 0 && t.devOut === 0))}>
                      <BarChart data={trends} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize:10, fill:'#64748b', textTransform:'capitalize'}} interval={timeframe === 'month' ? 'preserveStartEnd' : 0} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b'}} />
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Legend verticalAlign="top" height={36} iconType="circle"/>
                        <Bar dataKey={view === 'assistenza' ? 'astIn' : 'devIn'} fill="#94a3b8" radius={[4,4,0,0]} name="Creati" barSize={timeframe === 'month' ? 10 : 30}/>
                        <Bar dataKey={view === 'assistenza' ? 'astOut' : 'devOut'} fill={view === 'assistenza' ? '#10b981' : '#f59e0b'} radius={[4,4,0,0]} name="Risolti" barSize={timeframe === 'month' ? 10 : 30}/>
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