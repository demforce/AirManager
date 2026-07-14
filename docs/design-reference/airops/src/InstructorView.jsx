function InstructorView(){
  const me = INSTRUCTORS[1]; // Jun Park
  const myFlights = FLIGHTS.filter(f => f.cfi === me.id);
  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <h1>Buongiorno, {me.name.split(" ")[0]}</h1>
          <div className="sub"><span className="dot"/>{myFlights.length} voli oggi · €{me.owedMtd.toLocaleString()} dovuti nel mese</div>
        </div>
        <div style={{display:"flex", gap:8}}>
          <button className="btn"><Icon.book/> Le mie ore</button>
          <button className="btn primary"><Icon.plus/> Nuovo volo</button>
        </div>
      </div>
      <div className="kpi-row">
        <KPI label="Ore nel mese" value={me.hoursMtd.toFixed(1)} unit="h"/>
        <KPI label="Tariffa" value={`€${me.rate}`} unit="/ h"/>
        <KPI label="Dovuto nel mese" value={`€${me.owedMtd.toLocaleString()}`}/>
        <KPI label="Voli oggi" value={myFlights.length}/>
      </div>
      <div className="card">
        <div className="card-head"><div className="card-title">La mia giornata</div><span className="card-sub">MAR · 21 APR</span></div>
        <div className="list">
          {myFlights.map((f,i)=>(
            <div key={i} className="list-item" style={{gridTemplateColumns:"44px 1fr auto auto"}}>
              <div className="list-icon amber"><Icon.plane/></div>
              <div>
                <div className="list-title">{f.pilot} <span style={{color:"var(--ink-3)", fontWeight:400}}> — {f.route}</span></div>
                <div className="list-sub">{f.tail} · {(({dual:"Doppio",solo:"Solo",rental:"Noleggio",ifr:"IFR",multi:"ME"})[f.kind]||f.kind).toUpperCase()}</div>
              </div>
              <div className="mono" style={{fontSize:11.5, color:"var(--ink-2)"}}>
                {String(Math.floor(f.start)).padStart(2,"0")}:{String(Math.round((f.start%1)*60)).padStart(2,"0")}
                {" – "}
                {String(Math.floor(f.end)).padStart(2,"0")}:{String(Math.round((f.end%1)*60)).padStart(2,"0")}
              </div>
              <Badge tone={f.state==="active"?"warn":f.state==="complete"?"ok":"info"} dot>{({active:"in corso",complete:"completato",scheduled:"in programma"})[f.state]||f.state}</Badge>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
window.InstructorView = InstructorView;
