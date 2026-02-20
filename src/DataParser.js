/* eslint-disable */
import * as XLSX from 'xlsx';
import { isValid, parse } from 'date-fns';
import { enUS } from 'date-fns/locale';

// --- 1. NORMALIZZAZIONE NOMI ---
const normalizeOperatorName = (name) => {
  if (!name) return 'Sconosciuto';
  const cleanName = String(name).trim();
  const aliases = {
    'nicola pellicioni': 'Nicola',
    'emanuele rosti': 'Emanuele',
    'filippo rossi': 'Filippo',
    'marta f': 'Marta',
    'nouha m': 'Nouha',
    'giuseppe u': 'Giuseppe'
  };
  const key = cleanName.toLowerCase();
  if (aliases[key]) return aliases[key];
  const firstName = cleanName.split(' ')[0];
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
};

// --- 2. GESTIONE TEMPI (HH:MM:SS o Minuti) ---
const parseDurationToMinutes = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const str = String(val).toLowerCase().replace(/ hrs| min|m|s/g, '').trim();
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return (parts[0] * 60) + parts[1] + (parts[2] / 60);
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  return Number(str) || 0;
};

// --- 3. GESTIONE DATE (Excel Serial o Stringhe) ---
const cleanDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') return new Date(Math.round((val - 25569) * 86400 * 1000));
  const d = new Date(val);
  return isValid(d) ? d : null;
};

// --- 4. FUNZIONE PRINCIPALE ---
export const parseExcel = async (file, type) => {
  try {
    const buffer = await file.arrayBuffer();
    // cellDates: true è fondamentale per leggere bene le date da Excel
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (!rows.length) throw new Error("File vuoto o non leggibile");

    return processData(rows, type);
  } catch (err) {
    console.error("Errore Parser:", err);
    throw new Error(`Errore Lettura: ${err.message}`);
  }
};

const processData = (rawData, type) => {
  let cleanData = [];
  
  // Trova la riga delle intestazioni cercando parole chiave
  const findHeaderRow = (keywords) => {
    for (let i = 0; i < Math.min(rawData.length, 30); i++) {
      const rowStr = rawData[i].join(' ').toLowerCase();
      if (keywords.every(k => rowStr.includes(k.toLowerCase()))) return i;
    }
    return -1;
  };

  // --- LOGICA CHAT ---
  if (type === 'chat') {
    const hIdx = findHeaderRow(['Accepted']); // O altre keyword comuni
    if (hIdx === -1) throw new Error("Non trovo le colonne delle Chat (es. 'Accepted')");
    const h = rawData[hIdx].map(v => String(v).toLowerCase());

    const iOp = h.findIndex(v => v.includes('operator') || v.includes('name'));
    const iAcc = h.findIndex(v => v.includes('accepted') || v.includes('picked'));
    const iResp = h.findIndex(v => v.includes('response'));
    const iDur = h.findIndex(v => v.includes('duration'));

    for (let i = hIdx + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row[iOp] || String(row[iOp]).match(/Total|Generated|Admin/i)) continue;
      cleanData.push({
        operator: normalizeOperatorName(row[iOp]),
        chats_accepted: Number(row[iAcc]) || 0,
        avg_response_time: parseDurationToMinutes(row[iResp]),
        avg_duration: parseDurationToMinutes(row[iDur])
      });
    }
  }
  // --- LOGICA TICKET (ASSISTENZA E SVILUPPO) ---
  else if (type === 'assistenza' || type === 'sviluppo') {
    const hIdx = findHeaderRow(['Ticket']);
    if (hIdx === -1) throw new Error("Non trovo le colonne dei Ticket (es. 'Nuovo Ticket')");
    const h = rawData[hIdx].map(v => String(v).toLowerCase());

    const iDate = h.findIndex(v => v.includes('data') || v.includes('date'));
    const iNew = h.findIndex(v => v.includes('nuovo') || v.includes('new'));
    const iClo = h.findIndex(v => v.includes('chiusi') || v.includes('closed'));
    const iBack = h.findIndex(v => v.includes('backlog'));
    const iResp = h.findIndex(v => v.includes('risposta') || v.includes('response'));
    const iReso = h.findIndex(v => v.includes('risoluzione') || v.includes('resolution'));

    for (let i = hIdx + 1; i < rawData.length; i++) {
      const row = rawData[i];
      const date = cleanDate(row[iDate]);
      if (!date) continue;
      
      cleanData.push({
        date: date.toISOString(),
        new_tickets: Number(row[iNew]) || 0,
        closed_tickets: Number(row[iClo]) || 0,
        backlog: Number(row[iBack]) || 0,
        first_response_time: iResp !== -1 ? parseDurationToMinutes(row[iResp]) : 15,
        resolution_time: iReso !== -1 ? parseDurationToMinutes(row[iReso]) : 120
      });
    }
  }
  // --- LOGICA FORMAZIONI ---
  else if (type === 'formazioni') {
    const hIdx = findHeaderRow(['Durata']);
    if (hIdx === -1) throw new Error("Non trovo le colonne Formazioni (es. 'Durata')");
    const h = rawData[hIdx].map(v => String(v).toLowerCase());
    
    const iOp = h.findIndex(v => v.includes('creato') || v.includes('operator'));
    const iDur = h.findIndex(v => v.includes('durata') || v.includes('duration'));
    const iDate = h.findIndex(v => v.includes('ora') || v.includes('data'));
    const iDesc = h.findIndex(v => v.includes('azienda') || v.includes('nota'));

    for (let i = hIdx + 1; i < rawData.length; i++) {
      const row = rawData[i];
      const date = cleanDate(row[iDate]);
      if (date && row[iOp]) {
        cleanData.push({
          date: date.toISOString(),
          operator: normalizeOperatorName(row[iOp]),
          duration: Number(row[iDur]) || 0,
          topic: String(row[iDesc] || 'Formazione')
        });
      }
    }
  }

  return { rows: cleanData, count: cleanData.length };
};