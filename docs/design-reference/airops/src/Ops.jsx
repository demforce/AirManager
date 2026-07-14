function BookingsTable(){
  const [rows, setRows] = React.useState(BOOKINGS);
  const [denyFor, setDenyFor] = React.useState(null);
  const [reason, setReason] = React.useState("");
  const [showNew, setShowNew] = React.useState(false);
  const setState = (id, state, extra={}) => setRows(rs => rs.map(b => b.id===id ? {...b, state, ...extra} : b));
  const tone = (s) => s==="approved"?"ok":s==="pending"?"warn":s==="denied"?"bad":s==="no-show"?"":s==="flown"?"info":"";
  const STATE_IT = {pending:"in attesa", approved:"approvato", denied:"rifiutato", "no-show":"assente", flown:"effettuato"};
  const fmt = (s) => {
    // "2026-04-28 13:00" -> "28 Apr · 13:00"
    if (!s) return "—";
    const [d, t] = s.split(" ");
    const [y,mo,da] = d.split("-");
    const M = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"][+mo-1];
    return `${+da} ${M} · ${t}`;
  };
  const cols = "minmax(160px,1.6fr) 140px 140px 100px 130px minmax(180px,1fr)";
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Prenotazioni</div>
        <span className="card-sub">{rows.filter(b=>b.state==="pending").length} in attesa · {rows.length} totali</span>
        <div className="spacer"/>
        <ExportMenu filename="bookings"/>
        <button className="btn"><Icon.filter/> Tutti gli stati</button>
        <button className="btn primary" onClick={()=>setShowNew(true)}><Icon.plus/> Nuova prenotazione</button>
      </div>
      <div className="students">
        <div className="student-row header" style={{gridTemplateColumns:cols}}>
          <div>Pilota</div>
          <div>Inizio</div>
          <div>Fine</div>
          <div>Aereo</div>
          <div>Stato</div>
          <div>Azioni</div>
        </div>
        {rows.map(b => (
          <div key={b.id} className="student-row" style={{gridTemplateColumns:cols}}>
            <div>
              <div className="student-name">{b.pilot}</div>
              <div className="student-sub mono" style={{fontSize:11}}>{b.id} · {b.kind}{b.cfi!=="—" ? ` · CFI ${b.cfi}` : ""}</div>
            </div>
            <div className="mono" style={{fontSize:11.5}}>{fmt(b.start)}</div>
            <div className="mono" style={{fontSize:11.5, color:"var(--ink-2)"}}>{fmt(b.end)}</div>
            <div className="mono" style={{fontWeight:600}}>{b.tail}</div>
            <div>
              <Badge tone={tone(b.state)} dot>{STATE_IT[b.state]||b.state}</Badge>
              {b.state==="denied" && b.reason && <div className="student-sub" style={{marginTop:2}}>{b.reason}</div>}
            </div>
            <div style={{display:"flex", gap:4, flexWrap:"wrap"}}>
              {b.state==="pending" && <>
                <button className="btn mini ok" onClick={()=>{setState(b.id,"approved"); showToast(`Prenotazione ${b.id} approvata`);}}>Approva</button>
                <button className="btn mini bad" onClick={()=>setDenyFor(b.id)}>Rifiuta</button>
                <button className="btn mini">Modifica</button>
              </>}
              {b.state==="approved" && <>
                <button className="btn mini">Modifica</button>
                <button className="btn mini" onClick={()=>setState(b.id,"flown")}>Effettuato</button>
                <button className="btn mini" onClick={()=>setState(b.id,"no-show")}>Assente</button>
              </>}
              {(b.state==="denied"||b.state==="no-show"||b.state==="flown") && <>
                <button className="btn mini" onClick={()=>setState(b.id,"pending")}>Riapri</button>
              </>}
            </div>
          </div>
        ))}
      </div>
      {denyFor && (
        <div className="mini-modal">
          <div className="mini-modal-card">
            <div className="so-title" style={{fontSize:16}}>Rifiuta prenotazione {denyFor}</div>
            <div className="so-sub">La motivazione sarà inviata al pilota</div>
            <textarea className="input" rows="3" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Aeromobile non disponibile, conflitto istruttore, minime meteo…"/>
            <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
              <button className="btn" onClick={()=>{setDenyFor(null); setReason("");}}>Annulla</button>
              <button className="btn primary" onClick={()=>{setState(denyFor,"denied",{reason:reason||"Non specificato"}); showToast(`Prenotazione ${denyFor} rifiutata`, "bad"); setDenyFor(null); setReason("");}}>Invia rifiuto</button>
            </div>
          </div>
        </div>
      )}
      <NewBookingForm open={showNew} onClose={()=>setShowNew(false)} onCreate={(b)=>{setRows(rs=>[b,...rs]); showToast("Prenotazione creata");}}/>
    </div>
  );
}

function VisitingView(){
  const [rows, setRows] = React.useState(VISITING);
  const [showNew, setShowNew] = React.useState(false);
  const tone = (s) => s==="on-ground"?"ok":s==="inbound"?"info":s==="expected"?"warn":"";
  const STATUS_IT = {"on-ground":"al suolo", inbound:"in arrivo", expected:"atteso", departed:"partito"};
  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <h1>Voli in transito</h1>
          <div className="sub">Movimenti non basati · {rows.filter(v=>v.status==="on-ground").length} attualmente al suolo</div>
        </div>
        <div style={{display:"flex", gap:8}}>
          <ExportMenu filename="movimenti"/>
          <button className="btn primary" onClick={()=>setShowNew(true)}><Icon.plus/> Registra arrivo</button>
        </div>
      </div>
      <div className="kpi-row">
        <KPI label="Al suolo ora" value={rows.filter(v=>v.status==="on-ground").length}/>
        <KPI label="In arrivo oggi" value={rows.filter(v=>v.status==="inbound").length}/>
        <KPI label="Attesi domani" value={rows.filter(v=>v.status==="expected").length}/>
        <KPI label="Movimenti nel mese" value="138" delta="+11% su mese prec." trend="up" sparkData={VISITING_MOVEMENTS}/>
      </div>
      <div className="card">
        <div className="card-head"><div className="card-title">Registro movimenti</div><span className="card-sub">{rows.length} record</span></div>
        <div className="students">
          <div className="student-row header" style={{gridTemplateColumns:"90px 90px 120px 1.2fr 1fr 1fr 110px"}}>
            <div>Nominativo</div><div>Tipo</div><div>Rotta</div><div>Pilota · contatto</div><div>Arrivo</div><div>Partenza</div><div>Stato</div>
          </div>
          {rows.map(v => (
            <div key={v.id} className="student-row" style={{gridTemplateColumns:"90px 90px 120px 1.2fr 1fr 1fr 110px"}}>
              <div className="mono" style={{fontWeight:600}}>{v.callsign}</div>
              <div className="mono" style={{fontSize:11.5, color:"var(--ink-2)"}}>{v.type}</div>
              <div className="mono" style={{fontSize:11.5}}>{v.origin} → {v.dest}</div>
              <div><div className="student-name">{v.pilot}</div><div className="student-sub mono">{v.phone}</div></div>
              <div className="mono" style={{fontSize:11.5, color:"var(--ink-2)"}}>{v.eta}</div>
              <div className="mono" style={{fontSize:11.5, color:"var(--ink-2)"}}>{v.etd}</div>
              <div><Badge tone={tone(v.status)} dot>{STATUS_IT[v.status]||v.status}</Badge></div>
            </div>
          ))}
        </div>
      </div>
      <LogArrivalForm open={showNew} onClose={()=>setShowNew(false)} onCreate={(v)=>{setRows(rs=>[v,...rs]); showToast("Arrivo registrato");}}/>
    </>
  );
}

function PPRView(){
  const readInbox = () => { try { return JSON.parse(localStorage.getItem("airops-ppr-inbox") || "[]"); } catch { return []; } };
  const [rows, setRows] = React.useState(() => [...readInbox(), ...PPRS]);
  const [showNew, setShowNew] = React.useState(false);
  const setStatus = (id,s) => setRows(rs => rs.map(r => r.id===id ? {...r, status:s} : r));
  const mergeInbox = () => setRows(prev => {
    const have = new Set(prev.map(r=>r.id));
    const fresh = readInbox().filter(r=>!have.has(r.id));
    return fresh.length ? [...fresh, ...prev] : prev;
  });
  React.useEffect(()=>{
    const onStorage = (e)=>{ if(e.key==="airops-ppr-inbox") mergeInbox(); };
    window.addEventListener("storage", onStorage);
    return ()=> window.removeEventListener("storage", onStorage);
  }, []);
  const tone = (s) => s==="approved"?"ok":s==="pending"?"warn":"bad";
  const STATUS_IT = {pending:"in attesa", approved:"approvata", denied:"rifiutata"};
  const pending = rows.filter(r=>r.status==="pending");
  const approved = rows.filter(r=>r.status==="approved");

  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <h1>Richieste PPR</h1>
          <div className="sub">{pending.length} in attesa · {approved.length} approvate · {rows.filter(r=>r.status==="denied").length} rifiutate</div>
        </div>
        <div style={{display:"flex", gap:8}}>
          <a className="btn" href="PPR%20Request.html" target="_blank" rel="noopener"><Icon.arrow/> Modulo pubblico</a>
          <button className="btn"><Icon.doc/> Regole pubblicate</button>
          <button className="btn primary" onClick={()=>setShowNew(true)}><Icon.plus/> PPR manuale</button>
        </div>
      </div>

      {/* Full-width inbox */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Richieste in arrivo</div>
          <span className="card-sub">{pending.length} da esaminare · ordinate per arrivo</span>
          <div className="spacer"/>
          <button className="btn" onClick={mergeInbox}><Icon.arrow/> Aggiorna</button>
        </div>
        <div className="students">
          <div className="student-row header" style={{gridTemplateColumns:"110px 1.4fr 1.2fr 60px 1fr 180px"}}>
            <div>Nominativo · tipo</div><div>Richiedente</div><div>Orario</div><div>POB</div><div>Stato</div><div>Azioni</div>
          </div>
          {rows.map(r => (
            <div key={r.id} className="student-row" style={{gridTemplateColumns:"110px 1.4fr 1.2fr 60px 1fr 180px"}}>
              <div>
                <div className="mono" style={{fontWeight:600}}>{r.callsign}</div>
                <div className="student-sub mono">{r.type}</div>
              </div>
              <div>
                <div className="student-name">{r.requester}</div>
                <div className="student-sub mono">{r.contact}</div>
                {r.source==="public" && <span className="badge info" style={{marginTop:3, fontSize:9.5}}>da modulo web</span>}
              </div>
              <div>
                <div className="mono" style={{fontSize:11.5}}>{r.arrival}</div>
                <div className="student-sub mono">→ {r.departure}</div>
              </div>
              <div className="mono num">{r.pob}</div>
              <div>
                <Badge tone={tone(r.status)} dot>{STATUS_IT[r.status]||r.status}</Badge>
                {r.note && <div className="student-sub" style={{marginTop:2}}>{r.note}</div>}
              </div>
              <div style={{display:"flex", gap:4, flexWrap:"wrap"}}>
                {r.status==="pending" && <>
                  <button className="btn mini ok" onClick={()=>{setStatus(r.id,"approved"); showToast(`PPR ${r.id} approvata`);}}>Approva</button>
                  <button className="btn mini bad" onClick={()=>{setStatus(r.id,"denied"); showToast(`PPR ${r.id} rifiutata`, "bad");}}>Rifiuta</button>
                </>}
                {r.status!=="pending" && <button className="btn mini" onClick={()=>setStatus(r.id,"pending")}>Riapri</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <ManualPPRForm open={showNew} onClose={()=>setShowNew(false)} onCreate={(p)=>{setRows(rs=>[p,...rs]); showToast("Richiesta PPR aggiunta");}}/>
    </>
  );
}

Object.assign(window, { BookingsTable, VisitingView, PPRView });
