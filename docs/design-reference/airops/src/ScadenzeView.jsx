// Scadenze — certificate & rating expiry tracker. Anchored to NOW_REF so 7/30/60 windows are meaningful.

function ScadenzeView(){
  const [pilot, setPilot] = React.useState("all");
  const [cat, setCat] = React.useState("all");
  const [win, setWin] = React.useState("60");

  const MON = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
  const fmtDate = (s) => { const [y,m,d]=s.split("-"); return `${+d} ${MON[+m-1]} ${y}`; };
  const daysLeft = (s) => Math.round((new Date(s) - NOW_REF) / 86400000);

  // tier: 0 expired · 1 ≤7 · 2 ≤30 · 3 ≤60 · 4 valid
  const tierOf = (d) => d<0?0 : d<=7?1 : d<=30?2 : d<=60?3 : 4;
  const tierMeta = {
    0:{ tone:"bad",  tint:"var(--bad-soft)",  ink:"var(--bad)",  label:"Scaduto" },
    1:{ tone:"bad",  tint:"var(--bad-soft)",  ink:"var(--bad)",  label:"≤ 7 giorni" },
    2:{ tone:"warn", tint:"var(--warn-soft)", ink:"var(--accent-ink)", label:"≤ 30 giorni" },
    3:{ tone:"info", tint:"var(--info-soft)", ink:"var(--info)", label:"≤ 60 giorni" },
    4:{ tone:"ok",   tint:"",                 ink:"var(--ink-2)", label:"Valido" },
  };

  const rows = React.useMemo(()=>{
    const out = [];
    PILOTS.forEach(p => {
      if (p.medicalExp && p.medicalExp!=="—") out.push({ pilotId:p.id, pilot:p.name, role:p.role, cat:"Medico",  item:`Medico ${p.medical}`, expires:p.medicalExp });
      if (p.licenseExp && p.licenseExp!=="—") out.push({ pilotId:p.id, pilot:p.name, role:p.role, cat:"Licenza",  item:`Licenza ${p.license}`, expires:p.licenseExp });
    });
    RATING_EXPIRY.forEach(r => {
      const p = PILOTS.find(x=>x.id===r.pilotId); if(!p) return;
      out.push({ pilotId:p.id, pilot:p.name, role:p.role, cat:"Abilitazione", item:r.rating, expires:r.expires });
    });
    return out.map(r => ({ ...r, d: daysLeft(r.expires) })).sort((a,b)=>a.d-b.d);
  }, []);

  const count = (pred) => rows.filter(pred).length;
  const kExpired = count(r=>r.d<0), k7 = count(r=>r.d>=0&&r.d<=7), k30 = count(r=>r.d>7&&r.d<=30), k60 = count(r=>r.d>30&&r.d<=60);

  const inWindow = (d) => win==="all" ? true : win==="expired" ? d<0 : win==="7" ? d<=7 : win==="30" ? d<=30 : d<=60;
  const shown = rows.filter(r =>
    (pilot==="all" || r.pilot===pilot) &&
    (cat==="all" || r.cat===cat) &&
    inWindow(r.d)
  );

  const pilots = Array.from(new Set(rows.map(r=>r.pilot))).sort();
  const catTone = (c) => c==="Medico"?"info":c==="Licenza"?"":"warn";

  const StatCard = ({label, value, ink, note}) => (
    <div className="kpi" style={{borderLeft:`3px solid ${ink}`}}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value num" style={{color:ink}}>{value}</div>
      <div className="kpi-delta"><span>{note}</span></div>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <h1>Scadenze</h1>
          <div className="sub">Scadenze certificati e abilitazioni · riferite al 21 Apr 2026 · {kExpired+k7+k30+k60} da gestire</div>
        </div>
        <div style={{display:"flex", gap:8}}>
          <ExportMenu filename="scadenze"/>
          <button className="btn primary"><Icon.bell/> Invia promemoria</button>
        </div>
      </div>

      <div className="kpi-row" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
        <StatCard label="Scaduti" value={kExpired} ink="var(--bad)" note="azione richiesta"/>
        <StatCard label="Entro 7 giorni" value={k7} ink="var(--bad)" note="urgente"/>
        <StatCard label="Entro 30 giorni" value={k30} ink="var(--accent-ink)" note="pianifica rinnovo"/>
        <StatCard label="Entro 60 giorni" value={k60} ink="var(--info)" note="da tenere d'occhio"/>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Registro scadenze</div>
          <span className="card-sub">{shown.length} mostrati</span>
          <div className="spacer"/>
          <div className="segmented">
            {[["60","≤60g"],["30","≤30g"],["7","≤7g"],["expired","Scaduti"],["all","Tutte"]].map(([v,l])=>(
              <button key={v} className={win===v?"on":""} onClick={()=>setWin(v)}>{l}</button>
            ))}
          </div>
          <select className="input" style={{width:"auto", minWidth:120, fontSize:12}} value={cat} onChange={e=>setCat(e.target.value)}>
            <option value="all">Tutti i tipi</option><option value="Medico">Medico</option><option value="Licenza">Licenza</option><option value="Abilitazione">Abilitazione</option>
          </select>
          <select className="input" style={{width:"auto", minWidth:160, fontSize:12}} value={pilot} onChange={e=>setPilot(e.target.value)}>
            <option value="all">Tutti i piloti</option>
            {pilots.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="students">
          <div className="student-row header" style={{gridTemplateColumns:"minmax(140px,1.4fr) 110px minmax(150px,1.5fr) 130px 120px 120px"}}>
            <div>Pilota</div><div>Tipo</div><div>Certificato</div><div>Scadenza</div><div>Giorni rimasti</div><div>Stato</div>
          </div>
          {shown.length===0 && (
            <div className="student-row" style={{gridTemplateColumns:"1fr"}}>
              <div style={{color:"var(--ink-3)", padding:"8px 0"}}>Nulla in questa finestra. 🎉</div>
            </div>
          )}
          {shown.map((r,i) => {
            const t = tierMeta[tierOf(r.d)];
            return (
              <div key={i} className="student-row" style={{gridTemplateColumns:"minmax(140px,1.4fr) 110px minmax(150px,1.5fr) 130px 120px 120px", background:t.tint||undefined}}>
                <div><div className="student-name">{r.pilot}</div><div className="student-sub">{r.role}</div></div>
                <div><Badge tone={catTone(r.cat)}>{r.cat}</Badge></div>
                <div style={{fontSize:12.5}}>{r.item}</div>
                <div className="mono" style={{fontSize:11.5, color:"var(--ink-2)"}}>{fmtDate(r.expires)}</div>
                <div className="mono num" style={{fontWeight:600, color:t.ink}}>
                  {r.d<0 ? `${Math.abs(r.d)}g fa` : `${r.d} g`}
                </div>
                <div><Badge tone={t.tone} dot>{t.label}</Badge></div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// Compact overview widget: soonest expiries with a 7/30/60-day toggle.
function ScadenzeWidget({ onOpen }){
  const [win, setWin] = React.useState("30");
  const daysLeft = (s) => Math.round((new Date(s) - NOW_REF) / 86400000);
  const rows = React.useMemo(()=>{
    const out = [];
    PILOTS.forEach(p => {
      if (p.medicalExp && p.medicalExp!=="—") out.push({ pilot:p.name, item:`Medico ${p.medical}`, expires:p.medicalExp });
      if (p.licenseExp && p.licenseExp!=="—") out.push({ pilot:p.name, item:`Licenza ${p.license}`, expires:p.licenseExp });
    });
    RATING_EXPIRY.forEach(r => { const p = PILOTS.find(x=>x.id===r.pilotId); if(p) out.push({ pilot:p.name, item:r.rating, expires:r.expires }); });
    return out.map(r=>({...r, d:daysLeft(r.expires)})).sort((a,b)=>a.d-b.d);
  }, []);
  const all = rows.filter(r => r.d <= (+win));
  const shown = all.slice(0, 6);
  const iconTone = (d) => d<=7 ? "red" : "amber";
  const badgeTone = (d) => d<=7 ? "bad" : d<=30 ? "warn" : "info";
  const label = (d) => d<0 ? `${Math.abs(d)}g fa` : d===0 ? "oggi" : `tra ${d}g`;
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Scadenze</div>
        <span className="card-sub">{all.length} entro {win}g</span>
        <div className="spacer"/>
        <div className="segmented">
          {["7","30","60"].map(w=>(
            <button key={w} className={win===w?"on":""} onClick={()=>setWin(w)}>{w}g</button>
          ))}
        </div>
      </div>
      <div className="list">
        {shown.length===0 && <div style={{padding:"20px", color:"var(--ink-3)", fontSize:13}}>Nessuna scadenza entro {win} giorni. 🎉</div>}
        {shown.map((r,i)=>(
          <div key={i} className="list-item">
            <div className={`list-icon ${iconTone(r.d)}`}><Icon.clock/></div>
            <div>
              <div className="list-title">{r.pilot}</div>
              <div className="list-sub">{r.item}</div>
            </div>
            <Badge tone={badgeTone(r.d)} dot>{label(r.d)}</Badge>
          </div>
        ))}
      </div>
      {all.length>shown.length && (
        <div style={{padding:"10px 18px", borderTop:"1px solid var(--border)"}}>
          <button className="btn" style={{width:"100%", justifyContent:"center"}} onClick={()=>onOpen && onOpen()}>+{all.length-shown.length} altre · Vedi tutte</button>
        </div>
      )}
    </div>
  );
}

window.ScadenzeView = ScadenzeView;
window.ScadenzeWidget = ScadenzeWidget;
