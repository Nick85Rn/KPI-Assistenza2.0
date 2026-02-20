// ... (Tutte le funzioni di normalizzazione iniziali rimangono invariate) ...

else {
  const hIdx = findHeader(['Nuovo Ticket']);
  if (hIdx === -1) throw new Error("Header Ticket non trovato");
  const headers = rawData[hIdx].map(h => String(h).toLowerCase());
  const idxDate = headers.findIndex(h => h === 'data');
  const idxNew = headers.findIndex(h => h.includes('nuovo'));
  const idxClo = headers.findIndex(h => h.includes('chiusi'));
  const idxBack = headers.findIndex(h => h.includes('backlog'));
  const idxFirstResp = headers.findIndex(h => h.includes('prima risposta') || h.includes('first response'));
  const idxResolution = headers.findIndex(h => h.includes('risoluzione') || h.includes('resolution'));

  for (let i = hIdx + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!Array.isArray(row)) continue;
    const date = cleanDate(row[idxDate]);
    if (date) {
      cleanData.push({ 
        date: date.toISOString(), 
        new_tickets: Number(row[idxNew] || 0), 
        closed_tickets: Number(row[idxClo] || 0), 
        backlog: Number(row[idxBack] || 0), 
        first_response_time: parseDurationToMinutes(row[idxFirstResp]), 
        resolution_time: parseDurationToMinutes(row[idxResolution])
      });
    }
  }
}
return { rows: cleanData, range: rangeFound, count: cleanData.length };
};