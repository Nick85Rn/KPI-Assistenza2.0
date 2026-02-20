/* eslint-disable */
import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  Line, ComposedChart 
} from 'recharts';
import { 
  Database, Upload, Users, ClipboardList, AlertCircle, Code, LayoutDashboard, 
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, 
  Info, Loader2, Activity, User, Mail, Sparkles, Copy, Bug, RefreshCw, CheckCircle2 
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

// --- COMPONENTE MODALE PERSONALIZZATA ---
const SuccessModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center transform animate-in zoom-in-95 duration-300">
        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={40} />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">Sincronizzazione Avviata!</h3>
        <p className="text-slate-500 text-sm leading-relaxed mb-6">
          Make.com sta elaborando i ticket in background. I dati si aggiorneranno automaticamente tra pochi secondi.
        </p>
        <button onClick={onClose} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all active:scale-95">
          Ottimo, ho capito
        </button>
      </div>
    </div>
  );
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
      {isEmpty ? (<div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300"><Activity size={32} className="mb-2 opacity-20" /><span className="text-xs font-medium">Nessun dato per questo periodo</span></div>) : (<div style={{ width: '100%', height: '100%' }}><ResponsiveContainer width="99%" height="100%">{children}</ResponsiveContainer></div>)}
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
  const [uploadModal, setUploadModal] = useState(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [logs, setLogs] = useState([]);

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
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const periods = useMemo(() => {
    const startCurr = startOfWeek(currentDate, { weekStartsOn: 1 }); const endCurr = endOfWeek(currentDate, { weekStartsOn: 1 });
    const startPrev = subWeeks(startCurr, 1);
    return { curr: { start: startCurr, end: endCurr, label: `Sett. ${getISOWeek(currentDate)} (${format(startCurr, 'dd MMM')} - ${format(endCurr, 'dd MMM')})` }, prev: { start: startPrev } };
  }, [currentDate]);

  const kpi = useMemo(() => {
    const calc = (start, end) => {
      const astD = data.ast.filter(x => safeInRange(x.date, start, end));
      const devD = data.dev.filter(x => safeInRange(x.date, start, end));
      return { 
        ast_new: astD.reduce((a,b)=>a+Number(b.new_tickets),0), 
        ast_closed: astD.reduce((a,b)=>a+Number(b.closed_tickets),0),
        dev_backlog: devD.length > 0 ? Number(devD[devD.length-1].backlog) : 0,
        dev_closed: devD.reduce((a,b)=>a+Number(b.closed_tickets),0),
        dev_res: devD.length > 0 ? devD.reduce((a,b)=>a+Number(b.resolution_time||0),0)/devD.length : 0 
      };
    };
    return { curr: calc(periods.curr.start, periods.curr.end), prev: calc(subWeeks(periods.curr.start,1), subWeeks(periods.curr.end,1)) };
  }, [data, periods]);

  // --- TREND PER I GRAFICI ---
  const astTrend = useMemo(() => data.ast.filter(x => safeInRange(x.date, periods.curr.start, periods.curr.end)).map(x => ({ date: format(parseISO(x.date), 'EEE', {locale:it}), closed: x.closed_tickets, time: x.first_response_time })), [data, periods]);
  const devTrend = useMemo(() => data.dev.filter(x => safeInRange(x.date, periods.curr.start, periods.curr.end)).map(x => ({ date: format(parseISO(x.date), 'EEE', {locale:it}), closed: x.closed_tickets, time: x.resolution_time })), [data, periods]);

  const syncZohoAPI = async () => {
    setLoading(true);
    try {
      const res = await fetch('https://hook.eu1.make.com/46bhvr8e104vt5tfnweaomjkcg2p6bk6');
      if (!res.ok) throw new Error("Errore comunicazione Make.com");
      setIsSyncModalOpen(true);
      setTimeout(() => { fetchAll(); setLoading(false); }, 4000);
    } catch (err) { alert(err.message); setLoading(false); }
  };

  const handleFile = async (e, type) => {
    const file = e.target.files[0]; if (!file) return;
    try { const res = await parseExcel(file, type); setUploadModal({ type, rows: res.rows, file: file.name, range: res.range }); } catch (err) { alert(err.message); }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col z-20 shadow-xl">
        <div className="p-6 flex-1">
          <div className="flex items-center gap-3 mb-8"><div className="bg-indigo-600 p-2 rounded-lg"><Database className="text-white" size={20} /></div><h1 className="font-bold text-lg tracking-tight">Pienissimo<span className="text-indigo-600">.bi</span></h1></div>
          <div className="space-y-1">
            <SidebarItem icon={LayoutDashboard} label="Dashboard" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
            <SidebarItem icon={Users} label="Chat & Team" active={view === 'chat'} onClick={() => setView('chat')} />
            <SidebarItem icon={ClipboardList} label="Formazioni" active={view === 'formazioni'} onClick={() => setView('formazioni')} />
            <SidebarItem icon={AlertCircle} label="Ticket Assistenza" active={view === 'assistenza'} onClick={() => setView('assistenza')} />
            <SidebarItem icon={Code} label="Ticket Sviluppo" active={view === 'sviluppo'} onClick={() => setView('sviluppo')} />
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50">
        {/* Header */}
        <div className="bg-white/90 backdrop-blur-md border-b border-slate-200 px-8 py-4 flex justify-between items-center z-10 sticky top-0">
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
            <button onClick={() => setCurrentDate(subWeeks(currentDate,1))} className="p-1.5 hover:bg-white rounded-md transition-all"><ChevronLeft size={16}/></button>
            <span className="text-xs font-bold px-4 uppercase tracking-wide text-slate-600">{periods.curr.label}</span>
            <button onClick={() => setCurrentDate(addWeeks(currentDate,1))} className="p-1.5 hover:bg-white rounded-md transition-all"><ChevronRight size={16}/></button>
          </div>
          {loading && <div className="flex items-center gap-2 text-indigo-600 text-xs font-bold animate-pulse"><Loader2 size={14} className="animate-spin"/> Aggiornamento...</div>}
        </div>

        {/* Content View */}
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            
            {(view === 'assistenza' || view === 'sviluppo') && (
              <>
                <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 animate-in slide-in-from-top-4 duration-500">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 capitalize">Ticket {view}</h2>
                    <p className="text-slate-500 text-sm mt-1">Sincronizzato tramite Zoho Desk API</p>
                  </div>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer text-sm font-bold transition-all"><Upload size={16} /> Manuale<input type="file" className="hidden" onChange={(e) => handleFile(e, view)} /></label>
                    <button onClick={syncZohoAPI} className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md rounded-lg text-sm font-bold transition-all hover:scale-105 active:scale-95">
                      <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Sincronizza Dati di Oggi
                    </button>
                  </div>
                </div>
                
                {/* GRAFICO ASSISTENZA */}
                {view === 'assistenza' && (
                  <ChartContainer title="Tempo Risposta vs Volumi (Assistenza)" isEmpty={astTrend.length === 0}>
                    <ComposedChart data={astTrend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b', textTransform:'capitalize'}} />
                      <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b'}} />
                      <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#f59e0b'}} unit="m" />
                      <Tooltip contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                      <Legend verticalAlign="top" height={36}/>
                      <Bar yAxisId="left" dataKey="closed" fill="#6366f1" radius={[4,4,0,0]} name="Ticket Chiusi" barSize={40}/>
                      <Line yAxisId="right" type="monotone" dataKey="time" stroke="#f59e0b" strokeWidth={3} dot={{r:4, fill:'#f59e0b'}} name="Tempo Risposta (min)" />
                    </ComposedChart>
                  </ChartContainer>
                )}

                {/* GRAFICO SVILUPPO (NUOVO!) */}
                {view === 'sviluppo' && (
                  <ChartContainer title="Tempo Risoluzione vs Volumi (Sviluppo)" isEmpty={devTrend.length === 0}>
                    <ComposedChart data={devTrend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b', textTransform:'capitalize'}} />
                      <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#64748b'}} />
                      <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fontSize:12, fill:'#8b5cf6'}} unit="m" />
                      <Tooltip contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                      <Legend verticalAlign="top" height={36}/>
                      <Bar yAxisId="left" dataKey="closed" fill="#10b981" radius={[4,4,0,0]} name="Bug Chiusi" barSize={40}/>
                      <Line yAxisId="right" type="monotone" dataKey="time" stroke="#8b5cf6" strokeWidth={3} dot={{r:4, fill:'#8b5cf6'}} name="Tempo Risoluzione (min)" />
                    </ComposedChart>
                  </ChartContainer>
                )}
              </>
            )}

            {/* DASHBOARD GENERALE (Rimane uguale) */}
            {view === 'dashboard' && (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 animate-in fade-in duration-700">
                <ComparisonRow label="Ticket Chiusi (Assistenza)" current={kpi.curr.ast_closed} previous={kpi.prev.ast_closed} isTeamMetric={true} />
                <ComparisonRow label="Backlog Sviluppo" current={kpi.curr.dev_backlog} previous={kpi.prev.dev_backlog} invert={true} isTeamMetric={true} />
                <ComparisonRow label="Bugs Risolti" current={kpi.curr.dev_closed} previous={kpi.prev.dev_closed} isTeamMetric={true} />
                <ComparisonRow label="Tempo Risoluzione" current={kpi.curr.dev_res} previous={kpi.prev.dev_res} isTime={true} invert={true} isTeamMetric={true} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODALE DI SUCCESSO */}
      <SuccessModal isOpen={isSyncModalOpen} onClose={() => setIsSyncModalOpen(false)} />
    </div>
  );
}