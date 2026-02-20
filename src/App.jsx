/* eslint-disable */
import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  Line, ComposedChart, Cell, PieChart, Pie
} from 'recharts';
import { 
  Database, Users, AlertCircle, Code, LayoutDashboard, 
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, 
  Activity, RefreshCw, CheckCircle2, X, FileText, ClipboardCheck, Clock
} from 'lucide-react';
import { 
  format, subWeeks, addWeeks, startOfWeek, endOfWeek, 
  isWithinInterval, getISOWeek, eachDayOfInterval, parseISO, startOfDay, endOfDay 
} from 'date-fns';
import { it } from 'date-fns/locale'; 
import { supabase } from './supabaseClient';

// --- HELPERS DI FORMATTAZIONE ---
const formatNumber = (num) => { if (num === undefined || num === null || isNaN(num)) return 0; return Math.ceil(num).toLocaleString('it-IT'); };
const formatTime = (mins) => { 
  if (!mins || mins === 0 || isNaN(mins)) return "0m"; 
  if (mins < 60) return `${Math.ceil(mins)}m`; 
  const h = Math.floor(mins / 60);
  const m = Math.ceil(mins % 60);
  return `${h}h ${m}m`; 
};

const diffInMinutes = (endStr, startStr) => {
  if (!endStr || !startStr) return 0;
  const diff = (new Date(endStr) - new Date(startStr)) / 60000;
  return Math.max(0, diff);
};

const safeInRange = (dateString, start, end) => { 
  if (!dateString) return false; 
  const d = new Date(dateString); 
  return isWithinInterval(d, { start: startOfDay(start), end: endOfDay(end) }); 
};

// --- COMPONENTI UI ---
const SectionHeader = ({ icon: Icon, title, color }) => (
  <div className="flex items-center gap-2 mb-4 mt-2">
    <div className={`p-1.5 rounded-lg ${color}`}>
      <Icon size={18} className="text-white" />
    </div>
    <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider">{title}</h3>
  </div>
);

const ComparisonCard = ({ label, current, previous, unit = '', invert = false, isTime = false }) => {
  const diff = current - previous;
  const isPositive = invert ? diff <= 0 : diff >= 0;
  const color = diff === 0 ? 'text-slate-400 bg-slate-50' : isPositive ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';
  
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black text-slate-800">
          {isTime ? formatTime(current) : formatNumber(current)}
        </span>
        <span className="text-xs font-medium text-slate-400">{unit}</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>
          {diff > 0 ? <TrendingUp size={10}/> : diff < 0 ? <TrendingDown size={10}/> : null}
          {isTime ? formatTime(Math.abs(diff)) : formatNumber(Math.abs(diff))}
        </div>
        <span className="text-[10px] text-slate-400 font-medium">vs sett. prec.</span>
      </div>
    </div>
  );
};

export default function App() {
  const [view, setView] = useState('dashboard');
  const [data, setData] = useState({ chat: [], ast: [], dev: [], noshow: {} });
  const [loading, setLoading] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [generatedReport, setGeneratedReport] = useState(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [c, a, d] = await Promise.all([
        supabase.from('chat_performance').select('*'),
        supabase.from('zoho_raw_assistenza').select('*'),
        supabase.from('zoho_raw_sviluppo').select('*')
      ]);
      setData({ chat: c.data||[], ast: a.data||[], dev: d.data||[] });
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const periods = useMemo(() => {
    const startCurr = startOfWeek(currentDate, { weekStartsOn: 1 });
    const endCurr = endOfWeek(currentDate, { weekStartsOn: 1 });
    return { 
      curr: { start: startCurr, end: endCurr, label: `Settimana ${getISOWeek(currentDate)}` },
      prev: { start: subWeeks(startCurr, 1), end: subWeeks(endCurr, 1) }
    };
  }, [currentDate]);

  const kpi = useMemo(() => {
    const calc = (start, end) => {
      const chats = data.chat.filter(x => safeInRange(x.import_date, start, end));
      const volChat = chats.reduce((a,b) => a + Number(b.chats_accepted), 0);
      const respChat = volChat > 0 ? chats.reduce((a,b) => a + (Number(b.avg_response_time||0)*Number(b.chats_accepted)),0) / volChat : 0;

      const astIn = data.ast.filter(x => safeInRange(x.created_time, start, end));
      const astOut = data.ast.filter(x => safeInRange(x.closed_time, start, end));
      const slaAst = astOut.length > 0 ? astOut.reduce((a,x) => a + diffInMinutes(x.closed_time, x.created_time), 0) / astOut.length : 0;

      const devIn = data.dev.filter(x => safeInRange(x.created_time, start, end));
      const devOut = data.dev.filter(x => safeInRange(x.closed_time, start, end));
      const slaDev = devOut.length > 0 ? devOut.reduce((a,x) => a + diffInMinutes(x.closed_time, x.created_time), 0) / devOut.length : 0;
      
      const isClosed = (s) => s && (s.toLowerCase().includes('chius') || s.toLowerCase().includes('clos'));
      const backlog = data.dev.filter(x => !isClosed(x.status)).length;

      return { volChat, respChat, astIn: astIn.length, astOut: astOut.length, slaAst, backlog, slaDev };
    };
    return { curr: calc(periods.curr.start, periods.curr.end), prev: calc(periods.prev.start, periods.prev.end) };
  }, [data, periods]);

  const handleGenerateReport = () => {
    const c = kpi.curr;
    const p = kpi.prev;
    const report = `
      REPORT SETTIMANALE: ${periods.curr.label}
      -----------------------------------------
      CHAT: Gestite ${c.volChat} conversazioni (vs ${p.volChat}). 
      Tempo medio risposta: ${formatTime(c.respChat)}.

      ASSISTENZA: Ricevuti ${c.astIn} ticket, risolti ${c.astOut}.
      SLA Media Reale: ${formatTime(c.slaAst)}.

      SVILUPPO: Backlog attuale di ${c.backlog} bug. 
      Risolti questa settimana: ${c.astOut}. 
      Tempo medio risoluzione: ${formatTime(c.slaDev)}.
    `;
    setGeneratedReport(report);
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar spaziosa */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col z-20 shadow-sm">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-10">
            <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-200">
              <Database className="text-white" size={20} />
            </div>
            <h1 className="font-black text-xl tracking-tight">Pienissimo<span className="text-indigo-600">.bi</span></h1>
          </div>
          <nav className="space-y-2">
            {[
              { id: 'dashboard', icon: LayoutDashboard, label: 'Panoramica' },
              { id: 'assistenza', icon: AlertCircle, label: 'Assistenza' },
              { id: 'sviluppo', icon: Code, label: 'Sviluppo' }
            ].map(item => (
              <button 
                key={item.id}
                onClick={() => setView(item.id)}
                className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl transition-all font-bold text-sm ${view === item.id ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
              >
                <item.icon size={18} /> {item.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header con azioni */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-10 py-5 flex justify-between items-center z-10">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button onClick={() => setCurrentDate(subWeeks(currentDate,1))} className="p-2 hover:bg-white rounded-lg transition-all"><ChevronLeft size={18}/></button>
              <span className="text-xs font-black px-4 uppercase tracking-tighter text-slate-600">{periods.curr.label}</span>
              <button onClick={() => setCurrentDate(addWeeks(currentDate,1))} className="p-2 hover:bg-white rounded-lg transition-all"><ChevronRight size={18}/></button>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={handleGenerateReport}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
            >
              <FileText size={16} /> Genera Report
            </button>
            <button 
              onClick={fetchAll}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-100 transition-all"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Aggiorna Dati
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-10">
          <div className="max-w-6xl mx-auto space-y-10">
            
            {/* Sezione Report (Appare solo se generato) */}
            {generatedReport && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 relative animate-in fade-in zoom-in duration-300">
                <button onClick={() => setGeneratedReport(null)} className="absolute top-4 right-4 text-amber-400 hover:text-amber-600"><X size={18}/></button>
                <div className="flex items-center gap-2 mb-4 text-amber-700">
                  <ClipboardCheck size={20} />
                  <h3 className="font-bold uppercase text-xs tracking-widest">Analisi Testuale Settimanale</h3>
                </div>
                <pre className="text-sm font-medium text-amber-800 whitespace-pre-wrap leading-relaxed">{generatedReport}</pre>
              </div>
            )}

            {/* DASHBOARD ORGANIZZATA PER REPARTI */}
            <div className="space-y-8">
              
              {/* Gruppo CHAT */}
              <section>
                <SectionHeader icon={Users} title="Reparto Chat & Team" color="bg-blue-500" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ComparisonCard label="Conversazioni Totali" current={kpi.curr.volChat} previous={kpi.prev.volChat} unit="chat" />
                  <ComparisonCard label="Tempo Risposta Medio" current={kpi.curr.respChat} previous={kpi.prev.respChat} isTime={true} invert={true} />
                </div>
              </section>

              {/* Gruppo ASSISTENZA */}
              <section>
                <SectionHeader icon={AlertCircle} title="Supporto Tecnico (Ticket)" color="bg-emerald-500" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <ComparisonCard label="Nuovi Ticket" current={kpi.curr.astIn} previous={kpi.prev.astIn} unit="aperti" />
                  <ComparisonCard label="Ticket Risolti" current={kpi.curr.astOut} previous={kpi.prev.astOut} unit="chiusi" />
                  <ComparisonCard label="SLA Media Risoluzione" current={kpi.curr.slaAst} previous={kpi.prev.slaAst} isTime={true} invert={true} />
                </div>
              </section>

              {/* Gruppo SVILUPPO */}
              <section>
                <SectionHeader icon={Code} title="Sviluppo & Bug Fixing" color="bg-amber-500" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ComparisonCard label="Debito Tecnico (Backlog)" current={kpi.curr.backlog} previous={kpi.prev.backlog} unit="bug attivi" invert={true} />
                  <ComparisonCard label="Tempo Medio Fix" current={kpi.curr.slaDev} previous={kpi.prev.slaDev} isTime={true} invert={true} />
                </div>
              </section>

            </div>
          </div>
        </main>
      </div>
    </div>
  );
}