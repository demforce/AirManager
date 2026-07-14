// Impostazioni — identità del club, SMTP, disponibilità di pianificazione e catalogo abilitazioni. Persistite in localStorage.

function SettingsView(){
  const KEY = "airops-settings";
  const defaults = {
    clubName: "Aeroclub AirOps",
    icao: "LIML",
    contactEmail: "ops@airops.example",
    smtp: { host:"smtp.airops.example", port:"587", security:"STARTTLS", user:"ops@airops.example", pass:"", from:"AirOps Ops <ops@airops.example>" },
    sched: { open:"07:00", close:"21:00", minSlot:"60", maxAdvance:"30", buffer:"15" },
    ratings: RATING_TYPES.map(r => ({ ...r })),
  };
  const load = () => { try { const s = JSON.parse(localStorage.getItem(KEY)||"{}"); return { ...defaults, ...s, smtp:{...defaults.smtp,...(s.smtp||{})}, sched:{...defaults.sched,...(s.sched||{})}, ratings: s.ratings||defaults.ratings }; } catch { return defaults; } };

  const [cfg, setCfg] = React.useState(load);
  const [saved, setSaved] = React.useState(false);
  const set = (k,v) => setCfg(c => ({...c, [k]:v}));
  const setSmtp = (k,v) => setCfg(c => ({...c, smtp:{...c.smtp,[k]:v}}));
  const setSched = (k,v) => setCfg(c => ({...c, sched:{...c.sched,[k]:v}}));

  const setRating = (i,k,v) => setCfg(c => ({...c, ratings:c.ratings.map((r,idx)=>idx===i?{...r,[k]:v}:r)}));
  const addRating = () => setCfg(c => ({...c, ratings:[...c.ratings, {id:"r"+Date.now(), name:"", validity:12}]}));
  const removeRating = (i) => setCfg(c => ({...c, ratings:c.ratings.filter((_,idx)=>idx!==i)}));

  const save = () => { localStorage.setItem(KEY, JSON.stringify(cfg)); setSaved(true); showToast("Impostazioni salvate"); setTimeout(()=>setSaved(false), 2200); };

  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <h1>Impostazioni</h1>
          <div className="sub">Configurazione club · pianificazione · notifiche</div>
        </div>
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          {saved && <span className="badge ok" style={{marginRight:2}}><span className="b-dot"/>Salvato</span>}
          <button className="btn" onClick={()=>{ setCfg(defaults); }}>Ripristina</button>
          <button className="btn primary" onClick={save}><Icon.check/> Salva modifiche</button>
        </div>
      </div>

      {/* Identità club */}
      <div className="card">
        <div className="card-head"><div className="card-title">Club</div><span className="card-sub">Identità usata nella console e nei moduli pubblici</span></div>
        <div style={{padding:"18px 20px"}}>
          <div className="form-grid">
            <Field label="Nome del club" wide><Input value={cfg.clubName} onChange={e=>set("clubName",e.target.value)}/></Field>
            <Field label="Aeroporto base (ICAO)"><Input value={cfg.icao} onChange={e=>set("icao",e.target.value.toUpperCase())}/></Field>
            <Field label="Email di contatto"><Input type="email" value={cfg.contactEmail} onChange={e=>set("contactEmail",e.target.value)}/></Field>
          </div>
        </div>
      </div>

      {/* Disponibilità pianificazione */}
      <div className="card">
        <div className="card-head"><div className="card-title">Pianificazione</div><span className="card-sub">Finestra di disponibilità degli aeromobili per le prenotazioni</span></div>
        <div style={{padding:"18px 20px"}}>
          <div className="form-grid">
            <Field label="Aeromobili disponibili dalle"><Input type="time" value={cfg.sched.open} onChange={e=>setSched("open",e.target.value)}/></Field>
            <Field label="Aeromobili disponibili fino alle"><Input type="time" value={cfg.sched.close} onChange={e=>setSched("close",e.target.value)}/></Field>
            <Field label="Durata minima slot"><div className="input-group"><Input type="number" min="15" step="15" value={cfg.sched.minSlot} onChange={e=>setSched("minSlot",e.target.value)}/><span className="suffix">min</span></div></Field>
            <Field label="Margine di turnaround"><div className="input-group"><Input type="number" min="0" step="5" value={cfg.sched.buffer} onChange={e=>setSched("buffer",e.target.value)}/><span className="suffix">min</span></div></Field>
            <Field label="Anticipo massimo prenotazione" wide><div className="input-group"><Input type="number" min="1" value={cfg.sched.maxAdvance} onChange={e=>setSched("maxAdvance",e.target.value)}/><span className="suffix">giorni</span></div></Field>
          </div>
          <div className="hint" style={{marginTop:12, fontSize:12, color:"var(--ink-3)"}}>
            Gli aeromobili possono essere prenotati tra le <b style={{color:"var(--ink-2)"}}>{cfg.sched.open}</b> e le <b style={{color:"var(--ink-2)"}}>{cfg.sched.close}</b> locali, in incrementi di {cfg.sched.minSlot} minuti, fino a {cfg.sched.maxAdvance} giorni in anticipo.
          </div>
        </div>
      </div>

      {/* SMTP */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Email (SMTP)</div><span className="card-sub">Posta in uscita per risposte PPR, fatture e promemoria</span>
          <div className="spacer"/>
          <button className="btn" onClick={()=>{ setSaved(true); setTimeout(()=>setSaved(false),2200); }}>Invia email di prova</button>
        </div>
        <div style={{padding:"18px 20px"}}>
          <div className="form-grid">
            <Field label="Host SMTP"><Input value={cfg.smtp.host} onChange={e=>setSmtp("host",e.target.value)} placeholder="smtp.example.com"/></Field>
            <Field label="Porta"><Input type="number" value={cfg.smtp.port} onChange={e=>setSmtp("port",e.target.value)} placeholder="587"/></Field>
            <Field label="Sicurezza">
              <Select value={cfg.smtp.security} onChange={e=>setSmtp("security",e.target.value)}>
                <option>Nessuna</option><option>STARTTLS</option><option>SSL/TLS</option>
              </Select>
            </Field>
            <Field label="Indirizzo mittente"><Input value={cfg.smtp.from} onChange={e=>setSmtp("from",e.target.value)} placeholder="Club Ops <ops@example.com>"/></Field>
            <Field label="Nome utente"><Input value={cfg.smtp.user} onChange={e=>setSmtp("user",e.target.value)} autoComplete="off"/></Field>
            <Field label="Password"><Input type="password" value={cfg.smtp.pass} onChange={e=>setSmtp("pass",e.target.value)} placeholder="••••••••" autoComplete="new-password"/></Field>
          </div>
        </div>
      </div>

      {/* Catalogo abilitazioni */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Abilitazioni</div><span className="card-sub">Tipi di abilitazione e durata di validità</span>
          <div className="spacer"/>
          <button className="btn primary" onClick={addRating}><Icon.plus/> Aggiungi abilitazione</button>
        </div>
        <div className="students">
          <div className="student-row header" style={{gridTemplateColumns:"1fr 190px 150px"}}>
            <div>Nome abilitazione</div><div>Validità</div><div>Azioni</div>
          </div>
          {cfg.ratings.map((r,i) => (
            <div key={r.id||i} className="student-row" style={{gridTemplateColumns:"1fr 190px 150px", alignItems:"center"}}>
              <div><Input value={r.name} onChange={e=>setRating(i,"name",e.target.value)} placeholder="es. Abilitazione strumentale (IR)"/></div>
              <div className="input-group" style={{maxWidth:170}}>
                <Input type="number" min="0" value={r.validity} onChange={e=>setRating(i,"validity",e.target.value)}/>
                <span className="suffix">mesi</span>
              </div>
              <div style={{display:"flex", gap:6, alignItems:"center", justifyContent:"flex-end"}}>
                {(+r.validity===0) && <span className="badge" title="Non scade mai" style={{fontSize:9.5}}>senza scadenza</span>}
                <button className="btn mini bad" onClick={()=>removeRating(i)}>Rimuovi</button>
              </div>
            </div>
          ))}
        </div>
        <div style={{padding:"12px 20px", fontSize:12, color:"var(--ink-3)"}}>Imposta la validità a <b style={{color:"var(--ink-2)"}}>0</b> per le abilitazioni che non scadono mai (es. Abilitazione notturna). Le scadenze compaiono nella pagina Scadenze.</div>
      </div>
    </>
  );
}

window.SettingsView = SettingsView;
