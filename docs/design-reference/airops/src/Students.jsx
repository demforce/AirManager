function AlertsCard(){
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Attenzione richiesta</div>
        <span className="card-sub">{ALERTS.length} elementi</span>
      </div>
      <div className="list">
        {ALERTS.map((a,i)=>(
          <div key={i} className="list-item">
            <div className={`list-icon ${a.tone}`}>
              {a.icon==="alert" && <Icon.alert/>}
              {a.icon==="doc" && <Icon.doc/>}
              {a.icon==="cash" && <Icon.cash/>}
              {a.icon==="check" && <Icon.check/>}
            </div>
            <div>
              <div className="list-title">{a.title}</div>
              <div className="list-sub">{a.sub}</div>
            </div>
            <button className="btn" style={{padding:"4px 8px", fontSize:12}}>Apri</button>
          </div>
        ))}
      </div>
    </div>
  );
}

window.AlertsCard = AlertsCard;
