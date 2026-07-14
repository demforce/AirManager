// Aircraft + slide-over edit
function FleetCard({ onEdit }){
  const aog = TAILS.filter(a=>a.status==="aog").length;
  const avail = TAILS.filter(a=>a.status==="available").length;
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Aeromobili</div>
        <span className="card-sub">{TAILS.length} totali · {avail} disponibili · {aog} AOG</span>
        <div className="spacer"/>
        <button className="btn primary" onClick={()=>onEdit && onEdit({})}><Icon.plus/> Aggiungi aeromobile</button>
      </div>
      <div className="fleet-grid">
        {TAILS.map(ac => {
          const badge = ac.status==="aog" ? <Badge tone="bad" dot>AOG</Badge>
                      : ac.status==="reserved" ? <Badge tone="warn" dot>Riservato</Badge>
                      : <Badge tone="ok" dot>Disponibile</Badge>;
          return (
            <div className={`ac-card ${ac.status==="aog"?"aog":""}`} key={ac.tail} onClick={()=>onEdit && onEdit(ac)}>
              <div className="ac-head">
                <div className="ac-tail">{ac.tail}</div>
                {badge}
              </div>
              <div className="ac-silhouette"><Icon.acsmall/></div>
              <div className="ac-model">{ac.model}</div>
              <div className="meter-row" style={{marginTop:2}}>
                <span>Tariffa</span><span className="v mono">€{ac.rate}/h</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AircraftEditor({ ac, onClose }){
  const [form, setForm] = React.useState(() => ac || {});
  React.useEffect(()=> setForm(ac || {}), [ac]);
  const isNew = !ac?.tail;
  if (ac === null) return null;
  const set = (k,v)=> setForm(f => ({...f, [k]:v}));
  return (
    <SlideOver
      open={!!ac}
      onClose={onClose}
      title={isNew ? "Nuovo aeromobile" : (form.tail || "")}
      subtitle={isNew ? "Registra un aeromobile sul campo" : form.model}
      footer={
        <>
          {!isNew && <button className="btn">Elimina</button>}
          <div style={{flex:1}}/>
          <button className="btn" onClick={onClose}>Annulla</button>
          <button className="btn primary" onClick={onClose}>{isNew?"Aggiungi aeromobile":"Salva modifiche"}</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Marche / registrazione"><Input value={form.tail||""} onChange={e=>set("tail", e.target.value.toUpperCase())} placeholder="I-XXXX"/></Field>
        <Field label="Modello"><Input value={form.model||""} onChange={e=>set("model", e.target.value)}/></Field>
        <Field label="Disponibilità">
          <Select value={form.status||"available"} onChange={e=>set("status", e.target.value)}>
            <option value="available">Disponibile</option>
            <option value="reserved">Riservato</option>
            <option value="aog">AOG — a terra</option>
          </Select>
        </Field>
        <Field label="Proprietario">
          <Select value={form.owner||"Club"} onChange={e=>set("owner", e.target.value)}>
            <option value="Club">Club</option><option value="Private">Privato</option><option value="Rental">Noleggio</option>
          </Select>
        </Field>
        <Field label="Tariffa oraria (wet)">
          <div className="input-group"><span className="prefix">€</span><Input type="number" value={form.rate||""} onChange={e=>set("rate", +e.target.value)}/><span className="suffix">/ h</span></div>
        </Field>
        <Field label="Tariffa oraria (dry)">
          <div className="input-group"><span className="prefix">€</span><Input type="number" defaultValue={form.rate ? Math.round(form.rate*0.72) : ""} /><span className="suffix">/ h</span></div>
        </Field>
        <Field label="Posti"><Input type="number" value={form.seats||""} onChange={e=>set("seats", +e.target.value)}/></Field>
        <Field label="Carburante">
          <Select value={form.fuel||"AVGAS 100LL"} onChange={e=>set("fuel", e.target.value)}>
            <option>AVGAS 100LL</option><option>Jet A-1</option><option>Mogas</option>
          </Select>
        </Field>
        <Field label="Basato qui" wide>
          <div className="segmented">
            <button className={form.based?"on":""} onClick={()=>set("based", true)}>Basato</button>
            <button className={!form.based?"on":""} onClick={()=>set("based", false)}>Ospite</button>
          </div>
        </Field>
        <Field label="Note" wide>
          <textarea className="input" rows="3" placeholder="Note manutenzione, particolarità, parcheggio preferito…"/>
        </Field>
      </div>
    </SlideOver>
  );
}

window.FleetCard = FleetCard;
window.AircraftEditor = AircraftEditor;
