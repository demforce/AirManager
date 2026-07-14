function BillingView(){
  const [txns, setTxns] = React.useState(TRANSACTIONS);
  const [filterType, setFilterType] = React.useState("all");
  const [filterPilot, setFilterPilot] = React.useState("all");
  const [filterFrom, setFilterFrom] = React.useState("");
  const [filterTo, setFilterTo] = React.useState("");
  const [showNew, setShowNew] = React.useState(false);

  const types = Array.from(new Set(TRANSACTIONS.map(t=>t.type)));
  const pilots = Array.from(new Set(TRANSACTIONS.map(t=>t.pilot))).sort();
  const rows = txns.filter(t =>
    (filterType==="all"  || t.type===filterType) &&
    (filterPilot==="all" || t.pilot===filterPilot) &&
    (!filterFrom || t.date>=filterFrom) &&
    (!filterTo   || t.date<=filterTo)
  );

  const charges  = txns.filter(t=>t.amount>0).reduce((a,t)=>a+t.amount,0);
  const payments = txns.filter(t=>t.amount<0).reduce((a,t)=>a+Math.abs(t.amount),0);
  const net = charges - payments;
  const overdue = txns.filter(t=>t.status==="overdue").reduce((a,t)=>a+t.amount,0);
  const instrOwed = INSTRUCTORS.reduce((a,i)=>a+i.owedMtd,0);

  const fmt = (n) => "€" + Math.round(n).toLocaleString();
  const fmtAmt = (n) => (n<0?"−€":"€") + Math.abs(n).toLocaleString();
  const fmtDate = (s) => {
    const [y,m,d] = s.split("-");
    const M = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"][+m-1];
    return `${+d} ${M} ${y.slice(2)}`;
  };
  const typeTone = (t) => t==="Pagamento"?"ok":t==="Volo"?"info":t==="Istruzione"?"warn":"";
  const statusBadge = (s) =>
    s==="cleared" ? <Badge tone="ok" dot>Liquidato</Badge> :
    s==="overdue" ? <Badge tone="bad" dot>Scaduto</Badge> :
    s==="pending" ? <Badge tone="warn" dot>In attesa</Badge> :
    <Badge dot>Registrato</Badge>;

  // Revenue by category (charges only)
  const categories = ["Volo","Istruzione","Iscrizione","Carburante","Tassa d'atterraggio"];
  const byCat = categories.map(c => ({
    label: c,
    value: txns.filter(t=>t.type===c && t.amount>0).reduce((a,t)=>a+t.amount,0),
  })).filter(c=>c.value>0);
  const catMax = Math.max(1, ...byCat.map(c=>c.value));

  const cols = "92px 1.2fr 108px minmax(190px,1.6fr) 92px 108px 104px 72px";
  const del = (id) => { if (window.confirm(`Eliminare la transazione ${id}? L'operazione non è reversibile.`)) { setTxns(rs => rs.filter(t => t.id !== id)); showToast(`Transazione ${id} eliminata`, "bad"); } };

  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <h1>Contabilità</h1>
          <div className="sub">{txns.length} transazioni · ciclo Apr 2026</div>
        </div>
        <div style={{display:"flex", gap:8}}>
          <button className="btn"><Icon.doc/> Estratti conto</button>
          <button className="btn"><Icon.cash/> Esegui fatturazione</button>
          <button className="btn primary" onClick={()=>setShowNew(true)}><Icon.plus/> Nuova transazione</button>
        </div>
      </div>

      <div className="kpi-row">
        <KPI label="Ricavi del mese" value="€148,2k" delta="+12,4% su mese prec." trend="up" sparkData={REVENUE.slice(-10)}/>
        <KPI label="Addebiti fatturati" value={fmt(charges)} delta={`${txns.filter(t=>t.amount>0).length} addebiti`}/>
        <KPI label="Pagamenti ricevuti" value={fmt(payments)} delta={`${txns.filter(t=>t.amount<0).length} pagamenti`} trend="up"/>
        <KPI label="Credito netto" value={fmt(net)} delta={overdue?`${fmt(overdue)} scaduti`:"in linea"} trend={overdue?"down":undefined}/>
        <KPI label="Compensi istruttori" value={fmt(instrOwed)} delta={`${INSTRUCTORS.length} CFI`}/>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Transazioni</div>
          <span className="card-sub">{rows.length} di {txns.length} mostrate</span>
          <div className="spacer"/>
          <ExportMenu filename="transactions"/>
          <div style={{display:"flex", alignItems:"center", gap:5}} title="Intervallo date">
            <input type="date" className="input" style={{width:"auto", fontSize:12}} value={filterFrom} onChange={e=>setFilterFrom(e.target.value)}/>
            <span style={{color:"var(--ink-3)", fontSize:12}}>–</span>
            <input type="date" className="input" style={{width:"auto", fontSize:12}} value={filterTo} onChange={e=>setFilterTo(e.target.value)}/>
          </div>
          <select className="input" style={{width:"auto", minWidth:130, fontSize:12}} value={filterType} onChange={e=>setFilterType(e.target.value)}>
            <option value="all">Tutti i tipi</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="input" style={{width:"auto", minWidth:150, fontSize:12}} value={filterPilot} onChange={e=>setFilterPilot(e.target.value)}>
            <option value="all">Tutti i piloti</option>
            {pilots.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="students">
          <div className="student-row header" style={{gridTemplateColumns:cols}}>
            <div>Data</div><div>Pilota</div><div>Tipo</div><div>Descrizione</div><div>Metodo</div>
            <div style={{textAlign:"right"}}>Importo</div><div>Stato</div><div>Azioni</div>
          </div>
          {rows.map(t => (
            <div key={t.id} className="student-row" style={{gridTemplateColumns:cols}}>
              <div className="mono" style={{fontSize:11.5, color:"var(--ink-2)"}}>{fmtDate(t.date)}</div>
              <div><div className="student-name">{t.pilot}</div><div className="student-sub mono" style={{fontSize:10.5}}>{t.id}</div></div>
              <div><Badge tone={typeTone(t.type)}>{t.type}</Badge></div>
              <div style={{fontSize:12.5, color:"var(--ink-2)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{t.desc}</div>
              <div className="mono" style={{fontSize:11.5, color:"var(--ink-3)"}}>{t.method}</div>
              <div className="mono num" style={{fontWeight:600, textAlign:"right", color: t.amount<0?"var(--ok)":"var(--ink)"}}>{fmtAmt(t.amount)}</div>
              <div>{statusBadge(t.status)}</div>
              <div><button className="btn mini bad" onClick={()=>del(t.id)}>Elimina</button></div>
            </div>
          ))}
        </div>
      </div>

      <div className="split" style={{gridTemplateColumns:"1fr 1fr"}}>
        <div className="card">
          <div className="card-head"><div className="card-title">Ricavi per categoria</div><span className="card-sub">addebiti di questo ciclo</span></div>
          <div className="card-body" style={{display:"flex", flexDirection:"column", gap:14}}>
            {byCat.map((c,i)=>(
              <div key={i}>
                <div style={{display:"flex", justifyContent:"space-between", fontFamily:"var(--font-mono)", fontSize:11.5, marginBottom:6}}>
                  <span style={{color:"var(--ink-2)"}}>{c.label}</span>
                  <span style={{fontWeight:600, color:"var(--ink)"}}>{fmt(c.value)}</span>
                </div>
                <div style={{height:10, background:"var(--bg-sunken)", borderRadius:4, overflow:"hidden", border:"1px solid var(--border)"}}>
                  <div style={{height:"100%", width:`${(c.value/catMax)*100}%`, background:"var(--accent)"}}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><div className="card-title">Compensi istruttori</div><span className="card-sub">dovuto nel mese</span></div>
          <div className="card-body" style={{display:"flex", flexDirection:"column", gap:8}}>
            {INSTRUCTORS.map((i,idx)=>(
              <div key={idx} style={{display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:12.5}}>
                <span style={{display:"flex", alignItems:"center", gap:8}}>
                  <Avatar init={i.init} color={i.color}/> {i.name}
                </span>
                <span className="mono num" style={{color:"var(--ink-2)"}}>{i.hoursMtd.toFixed(1)}h · €{i.rate}/h</span>
                <span className="mono num" style={{fontWeight:600}}>{fmt(i.owedMtd)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <NewTransactionForm open={showNew} onClose={()=>setShowNew(false)} onCreate={(t)=>{setTxns(rs=>[t,...rs]); showToast("Transazione registrata");}}/>
    </>
  );
}

window.BillingView = BillingView;
