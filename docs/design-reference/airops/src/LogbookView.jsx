function LogbookView(){
  const [filterFrom, setFilterFrom] = React.useState("");
  const [filterTo, setFilterTo] = React.useState("");
  const [filterPilot, setFilterPilot] = React.useState("all");
  const [filterTail, setFilterTail] = React.useState("all");
  const [entries, setEntries] = React.useState(LOGBOOK);
  const [showNew, setShowNew] = React.useState(false);
  const MON = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  const lbISO = (s) => { const [d,mo,y]=s.split(" "); return `20${y}-${String(MON[mo]+1).padStart(2,"0")}-${String(+d).padStart(2,"0")}`; };
  const fullName = (abbr) => { const p = PILOTS.find(x=>{const pt=x.name.split(" ");return `${pt[0][0]}. ${pt[pt.length-1]}`===abbr;}); return p?p.name:abbr; };
  const pilotOpts = Array.from(new Set(entries.map(l=>l.pilot))).map(v=>({value:v,label:fullName(v)})).sort((a,b)=>a.label.localeCompare(b.label));
  const tails  = Array.from(new Set(entries.map(l=>l.tail)));
  const rows = entries.filter(l => {
    const ds = lbISO(l.date);
    return (!filterFrom || ds>=filterFrom) &&
           (!filterTo   || ds<=filterTo) &&
           (filterPilot==="all" || l.pilot===filterPilot) &&
           (filterTail==="all"  || l.tail===filterTail);
  });
  const totals = rows.reduce((a,l)=>{
    a.dur += l.dur; a.takeoffs += l.takeoffs; a.landings += l.landings; a.cost += l.cost; return a;
  }, {dur:0, takeoffs:0, landings:0, cost:0});
  const kindTone = (k) => {
    if (k.includes("IFR")) return "info";
    if (k.includes("ME")) return "warn";
    if (k.includes("Solo")) return "ok";
    if (k.includes("Noleggio")) return "";
    return "";
  };
  const toHHMM = (dec) => {
    const h = Math.floor(dec);
    const m = Math.round((dec - h) * 60);
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  };
  const cols = "90px 120px minmax(130px,1.6fr) 90px 110px 64px 50px 50px 90px 110px";
  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <h1>Registro voli</h1>
          <div className="sub">Diario di volo · ultimi 4 giorni · {rows.length} voci</div>
        </div>
        <div style={{display:"flex", gap:8}}>
          <ExportMenu filename="registro-voli"/>
          <button className="btn primary" onClick={()=>setShowNew(true)}><Icon.plus/> Nuova voce</button>
        </div>
      </div>
      <div className="kpi-row">
        <KPI label="Voci (filtrate)" value={rows.length} delta="ultimi 4 giorni"/>
        <KPI label="Ore di volo" value={toHHMM(totals.dur)} unit="hh:mm" sparkData={[12,18,22,19,24,28,26,32]}/>
        <KPI label="Decolli / atterraggi" value={`${totals.takeoffs} / ${totals.landings}`}/>
        <KPI label="Ricavo" value={`€${totals.cost.toLocaleString()}`}/>
        <KPI label="Voli IFR" value={rows.filter(r=>r.kind.includes("IFR")).length}/>
      </div>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Diario di volo</div>
          <div className="spacer"/>
          <ExportMenu filename="logbook"/>
          <div style={{display:"flex", alignItems:"center", gap:5}} title="Intervallo date">
            <input type="date" className="input" style={{width:"auto", fontSize:12}} value={filterFrom} onChange={e=>setFilterFrom(e.target.value)}/>
            <span style={{color:"var(--ink-3)", fontSize:12}}>–</span>
            <input type="date" className="input" style={{width:"auto", fontSize:12}} value={filterTo} onChange={e=>setFilterTo(e.target.value)}/>
          </div>
          <select className="input" style={{width:"auto", minWidth:150, fontSize:12}} value={filterPilot} onChange={e=>setFilterPilot(e.target.value)}>
            <option value="all">Tutti i piloti</option>
            {pilotOpts.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select className="input" style={{width:"auto", minWidth:110, fontSize:12}} value={filterTail} onChange={e=>setFilterTail(e.target.value)}>
            <option value="all">Tutti gli aerei</option>
            {tails.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="logbook">
          <div className="lb-row header" style={{gridTemplateColumns:cols}}>
            <div>Data</div>
            <div>Part → Arr</div>
            <div>Pilota</div>
            <div>Aereo</div>
            <div>Tipo</div>
            <div>Ore</div>
            <div>Dec</div>
            <div>Att</div>
            <div>Costo</div>
            <div>Azioni</div>
          </div>
          {rows.map((l,i) => (
            <div key={i} className="lb-row" style={{gridTemplateColumns:cols}}>
              <div className="mono" style={{fontSize:11.5, color:"var(--ink-2)"}}>{l.date}</div>
              <div className="mono" style={{fontSize:11.5, fontWeight:600}}>{l.dep.trim()} → {l.arr.trim()}</div>
              <div>
                <div>{l.pilot}</div>
                {l.cfi!=="—" && <div className="student-sub mono">CFI {l.cfi}</div>}
              </div>
              <div className="mono" style={{fontWeight:600}}>{l.tail}</div>
              <div><Badge tone={kindTone(l.kind)}>{l.kind}</Badge></div>
              <div className="mono num">{toHHMM(l.dur)}</div>
              <div className="mono num">{l.takeoffs}</div>
              <div className="mono num">{l.landings}</div>
              <div className="mono num" style={{fontWeight:600}}>€{l.cost}</div>
              <div style={{display:"flex", gap:4, flexWrap:"wrap"}}>
                <button className="btn mini">Vedi</button>
                <button className="btn mini">Modifica</button>
              </div>
            </div>
          ))}
          <div className="lb-row total" style={{gridTemplateColumns:cols}}>
            <div/><div/><div/><div/>
            <div style={{color:"var(--ink-3)", fontFamily:"var(--font-mono)", fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em"}}>Totali</div>
            <div className="mono num" style={{fontWeight:600}}>{toHHMM(totals.dur)}</div>
            <div className="mono num" style={{fontWeight:600}}>{totals.takeoffs}</div>
            <div className="mono num" style={{fontWeight:600}}>{totals.landings}</div>
            <div className="mono num" style={{fontWeight:600}}>€{totals.cost.toLocaleString()}</div>
            <div/>
          </div>
        </div>
      </div>
      <NewLogbookForm open={showNew} onClose={()=>setShowNew(false)} onCreate={(e)=>{setEntries(rs=>[e,...rs]); showToast("Voce di registro aggiunta");}}/>
    </>
  );
}

window.LogbookView = LogbookView;
