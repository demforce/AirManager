function PilotsView({ onEdit, onProfile }){
  const [q, setQ] = React.useState("");
  const rows = PILOTS.filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase()) ||
    p.email.toLowerCase().includes(q.toLowerCase()) ||
    p.role.toLowerCase().includes(q.toLowerCase())
  );
  const roleTone = (r) => r==="Student"?"info":r==="Member"?"ok":r==="Renter"?"warn":"";
  const statusTone = (s) => s==="active"?"ok":s==="suspended"?"bad":"";
  const ROLE_IT = { Student:"Studente", Member:"Socio", Renter:"Noleggiatore", Instructor:"Istruttore", Visitor:"Visitatore" };
  const STATUS_IT = { active:"attivo", suspended:"sospeso", inactive:"inattivo" };
  const fmtDate = (s) => {
    if (!s || s==="—") return "—";
    const [y,m,d] = s.split("-");
    const M = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"][+m-1];
    return `${+d} ${M} ${y.slice(2)}`;
  };
  const cols = "minmax(150px,1.4fr) minmax(160px,1.6fr) 100px 130px 120px 100px 120px minmax(160px,1fr)";
  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <h1>Piloti</h1>
          <div className="sub">{PILOTS.length} in archivio · {PILOTS.filter(p=>p.current).length} correnti · {PILOTS.filter(p=>p.accountStatus==="suspended").length} sospesi</div>
        </div>
        <div style={{display:"flex", gap:8}}>
          <ExportMenu filename="piloti"/>
          <button className="btn primary" onClick={()=>onEdit({})}><Icon.plus/> Aggiungi pilota</button>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Anagrafica piloti</div>
          <div className="spacer"/>
          <ExportMenu filename="pilots"/>
          <div className="search" style={{width:260}}>
            <Icon.search/><input className="bare-input" placeholder="Cerca per nome, email, ruolo…" value={q} onChange={e=>setQ(e.target.value)}/>
          </div>
        </div>
        <div className="students">
          <div className="student-row header" style={{gridTemplateColumns:cols}}>
            <div>Nome</div>
            <div>Email</div>
            <div>Saldo</div>
            <div>Corrente</div>
            <div>Ultimo volo</div>
            <div>Ruolo</div>
            <div>Stato</div>
            <div>Azioni</div>
          </div>
          {rows.map(p => (
            <div key={p.id} className="student-row" style={{gridTemplateColumns:cols}}>
              <div>
                <div className="student-name" style={{cursor:"pointer", textDecoration:"underline", textDecorationColor:"var(--border-strong)", textUnderlineOffset:3}} onClick={(e)=>{e.stopPropagation(); onProfile(p);}}>{p.name}</div>
                <div className="student-sub">{p.license}{p.licenseNo!=="-" ? ` · ${p.licenseNo}` : ""}</div>
              </div>
              <div className="mono" style={{fontSize:11.5, color:"var(--ink-2)", overflow:"hidden", textOverflow:"ellipsis"}}>{p.email}</div>
              <div className="mono num" style={{fontWeight:600, color: p.balance<0?"oklch(0.5 0.17 25)":"var(--ink)"}}>€{p.balance}</div>
              <div><Badge tone={p.current?"ok":"bad"} dot>{p.current?"corrente":"non corrente"}</Badge></div>
              <div className="mono" style={{fontSize:11.5, color:"var(--ink-2)"}}>{fmtDate(p.lastFlight)}</div>
              <div><Badge tone={roleTone(p.role)}>{ROLE_IT[p.role]||p.role}</Badge></div>
              <div><Badge tone={statusTone(p.accountStatus)} dot>{STATUS_IT[p.accountStatus]||p.accountStatus}</Badge></div>
              <div style={{display:"flex", gap:4, flexWrap:"wrap"}}>
                <button className="btn mini" onClick={(e)=>{e.stopPropagation(); onEdit(p);}}>Modifica</button>
                <button className="btn mini" onClick={(e)=>e.stopPropagation()}>Registra</button>
                {p.accountStatus==="active" ? (
                  <button className="btn mini bad" onClick={(e)=>e.stopPropagation()}>Sospendi</button>
                ) : (
                  <button className="btn mini ok" onClick={(e)=>e.stopPropagation()}>Riattiva</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function PilotEditor({ pilot, onClose }){
  const [form, setForm] = React.useState(() => pilot || {});
  React.useEffect(()=> setForm(pilot || {}), [pilot]);
  if (pilot === null) return null;
  const isNew = !pilot?.name;
  const set = (k,v)=> setForm(f => ({...f, [k]:v}));
  return (
    <SlideOver open={!!pilot} onClose={onClose}
      title={isNew?"Nuovo pilota":(form.name||"")}
      subtitle={isNew?"Aggiungi un pilota all'anagrafica":form.license}
      footer={<>
        {!isNew && <button className="btn">Elimina</button>}
        <div style={{flex:1}}/>
        <button className="btn" onClick={onClose}>Annulla</button>
        <button className="btn primary" onClick={onClose}>{isNew?"Aggiungi pilota":"Salva modifiche"}</button>
      </>}>
      <div className="form-grid">
        <Field label="Nome completo" wide><Input value={form.name||""} onChange={e=>set("name",e.target.value)}/></Field>
        <Field label="Email"><Input type="email" placeholder="pilota@example.com"/></Field>
        <Field label="Telefono"><Input placeholder="+39 …"/></Field>
        <Field label="Tipo licenza">
          <Select value={form.license||"PPL"} onChange={e=>set("license", e.target.value)}>
            <option>Allievo</option><option>PPL</option><option>CPL</option><option>ATPL</option>
          </Select>
        </Field>
        <Field label="N. licenza"><Input value={form.licenseNo||""} onChange={e=>set("licenseNo",e.target.value)}/></Field>
        <Field label="Scadenza licenza"><Input type="date" value={form.licenseExp && form.licenseExp!=="—" ? form.licenseExp : ""} onChange={e=>set("licenseExp",e.target.value)}/></Field>
        <Field label="Classe medica">
          <Select value={form.medical||"Classe 2"} onChange={e=>set("medical",e.target.value)}>
            <option>Classe 1</option><option>Classe 2</option><option>LAPL</option>
          </Select>
        </Field>
        <Field label="Scadenza medico"><Input type="date" value={form.medicalExp||""} onChange={e=>set("medicalExp",e.target.value)}/></Field>
        <Field label="Abilitazioni" wide><Input value={form.ratings||""} onChange={e=>set("ratings",e.target.value)} placeholder="IR · ME · Notturna"/></Field>
        <Field label="Saldo conto">
          <div className="input-group"><span className="prefix">€</span><Input type="number" value={form.balance||0} onChange={e=>set("balance",+e.target.value)}/></div>
        </Field>
      </div>
    </SlideOver>
  );
}

function InstructorsView({ onEdit, onProfile }){
  const totalOwed = INSTRUCTORS.reduce((a,i)=>a+i.owedTotal,0);
  const totalHours = INSTRUCTORS.reduce((a,i)=>a+i.hoursTotal,0);
  const cols = "minmax(160px,1.8fr) 100px 140px 160px minmax(160px,1fr)";
  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <h1>Istruttori</h1>
          <div className="sub">{INSTRUCTORS.length} attivi · €{totalOwed.toLocaleString()} da liquidare</div>
        </div>
        <div style={{display:"flex", gap:8}}>
          <button className="btn"><Icon.cash/> Ciclo pagamenti</button>
          <button className="btn primary" onClick={()=>onEdit({})}><Icon.plus/> Aggiungi istruttore</button>
        </div>
      </div>
      <div className="kpi-row">
        <KPI label="Istruttori attivi" value={INSTRUCTORS.length}/>
        <KPI label="Ore totali volate" value={totalHours.toLocaleString()} unit="h"/>
        <KPI label="Totale dovuto" value={`€${totalOwed.toLocaleString()}`} delta="tutti i CFI"/>
        <KPI label="Tariffa media" value={`€${Math.round(INSTRUCTORS.reduce((a,i)=>a+i.rate,0)/INSTRUCTORS.length)}`} unit="/ h"/>
      </div>
      <div className="card">
        <div className="card-head"><div className="card-title">Elenco istruttori</div><div className="spacer"/><ExportMenu filename="instructors"/></div>
        <div className="students">
          <div className="student-row header" style={{gridTemplateColumns:cols}}>
            <div>Nome</div>
            <div>Tariffa</div>
            <div>Ore totali</div>
            <div>Totale dovuto</div>
            <div>Azioni</div>
          </div>
          {INSTRUCTORS.map(i => (
            <div key={i.id} className="student-row" style={{gridTemplateColumns:cols}}>
              <div>
                <div className="student-name" style={{cursor:"pointer", textDecoration:"underline", textDecorationColor:"var(--border-strong)", textUnderlineOffset:3}} onClick={(e)=>{e.stopPropagation(); onProfile(i);}}>{i.name}</div>
                <div className="student-sub">{i.ratings}</div>
              </div>
              <div className="mono num">€{i.rate}/h</div>
              <div className="mono num">{i.hoursTotal.toLocaleString()}</div>
              <div className="mono num" style={{fontWeight:600}}>€{i.owedTotal.toLocaleString()}</div>
              <div style={{display:"flex", gap:4, flexWrap:"wrap"}}>
                <button className="btn mini" onClick={(e)=>{e.stopPropagation(); onEdit(i);}}>Modifica</button>
                <button className="btn mini ok">Paga</button>
                <button className="btn mini">Registra</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function InstructorEditor({ ins, onClose }){
  const [form, setForm] = React.useState(() => ins || {});
  React.useEffect(()=> setForm(ins || {}), [ins]);
  if (ins === null) return null;
  const isNew = !ins?.name;
  const set = (k,v)=> setForm(f => ({...f, [k]:v}));
  return (
    <SlideOver open={!!ins} onClose={onClose}
      title={isNew?"Nuovo istruttore":(form.name||"")}
      subtitle={isNew?"Aggiungi un istruttore":form.ratings}
      footer={<>
        {!isNew && <button className="btn">Elimina</button>}
        <div style={{flex:1}}/>
        <button className="btn" onClick={onClose}>Annulla</button>
        <button className="btn primary" onClick={onClose}>{isNew?"Aggiungi":"Salva modifiche"}</button>
      </>}>
      <div className="form-grid">
        <Field label="Nome completo" wide><Input value={form.name||""} onChange={e=>set("name",e.target.value)}/></Field>
        <Field label="Email"><Input type="email"/></Field>
        <Field label="Telefono"><Input/></Field>
        <Field label="Abilitazioni" wide><Input value={form.ratings||""} onChange={e=>set("ratings",e.target.value)} placeholder="CFI · CFII · MEI"/></Field>
        <Field label="Tariffa oraria">
          <div className="input-group"><span className="prefix">€</span><Input type="number" value={form.rate||""} onChange={e=>set("rate",+e.target.value)}/><span className="suffix">/ h</span></div>
        </Field>
        <Field label="Cadenza pagamenti">
          <Select defaultValue="monthly"><option value="monthly">Mensile</option><option value="weekly">Settimanale</option><option value="per-flight">Per volo</option></Select>
        </Field>
        <Field label="Ore totali (sola lettura)">
          <Input value={form.hoursTotal ? form.hoursTotal.toLocaleString()+" h" : "0 h"} disabled/>
        </Field>
        <Field label="Totale dovuto (sola lettura)">
          <Input value={form.owedTotal ? "€"+form.owedTotal.toLocaleString() : "€0"} disabled/>
        </Field>
        <Field label="Note" wide><textarea className="input" rows="3" placeholder="Disponibilità, specializzazioni…"/></Field>
      </div>
    </SlideOver>
  );
}

Object.assign(window, { PilotsView, PilotEditor, InstructorsView, InstructorEditor });
