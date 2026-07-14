// Pilot (self-service) landing — light read-only view
function PilotLanding(){
  const me = PILOTS[1]; // Liam Marchetti
  const myFlights = FLIGHTS.filter(f => f.pilot && f.pilot.includes("Marchetti"));
  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <h1>Ciao, {me.name.split(" ")[0]}</h1>
          <div className="sub"><span className="dot"/>Conto · {me.license} · €{me.balance}</div>
        </div>
        <div style={{display:"flex", gap:8}}>
          <button className="btn"><Icon.book/> Il mio registro</button>
          <button className="btn primary"><Icon.plus/> Prenota volo</button>
        </div>
      </div>
      <div className="kpi-row">
        <KPI label="Saldo conto" value={`€${me.balance}`}/>
        <KPI label="Licenza" value={me.license}/>
        <KPI label="Scadenza medico" value={me.medicalExp}/>
        <KPI label="Abilitazioni" value={me.ratings || "—"}/>
      </div>
      <div className="card">
        <div className="card-head"><div className="card-title">I miei prossimi voli</div></div>
        <div className="list">
          {myFlights.length===0 && <div style={{padding:24, color:"var(--ink-3)"}}>Nessun volo in programma.</div>}
          {myFlights.map((f,i)=>(
            <div key={i} className="list-item">
              <div className="list-icon amber"><Icon.plane/></div>
              <div><div className="list-title">{f.route}</div><div className="list-sub">{f.tail} · {({dual:"Doppio",solo:"Solo",rental:"Noleggio",ifr:"IFR",multi:"ME"})[f.kind]||f.kind}</div></div>
              <Badge tone={f.state==="active"?"warn":f.state==="complete"?"ok":"info"} dot>{({active:"in corso",complete:"completato",scheduled:"in programma"})[f.state]||f.state}</Badge>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
window.PilotLanding = PilotLanding;
