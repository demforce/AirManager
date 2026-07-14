// Slide-over forms behind "create" buttons: New booking, Log arrival, Manual PPR, New transaction.
// Each is controlled: parent owns the list and receives the new record via onCreate.

const rid = (prefix, base, span) => `${prefix}-${base + Math.floor(Math.random() * span)}`;

function NewBookingForm({ open, onClose, onCreate }) {
  const blank = { pilot: "", tail: TAILS[0]?.tail || "", cfi: "—", kind: "Noleggio", date: "2026-04-29", start: "09:00", dur: "1.5" };
  const [f, setF] = React.useState(blank);
  React.useEffect(() => { if (open) setF(blank); }, [open]);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const submit = () => {
    const [hh, mm] = f.start.split(":").map(Number);
    const endMin = hh * 60 + mm + Math.round(parseFloat(f.dur || 0) * 60);
    const eh = String(Math.floor(endMin / 60) % 24).padStart(2, "0"), em = String(endMin % 60).padStart(2, "0");
    onCreate({
      id: rid("BKG", 2214, 400), pilot: f.pilot || "Nuovo pilota", tail: f.tail, cfi: f.cfi,
      start: `${f.date} ${f.start}`, end: `${f.date} ${eh}:${em}`, dur: parseFloat(f.dur || 0),
      state: "pending", kind: f.kind
    });
    onClose();
  };
  return (
    <SlideOver open={open} onClose={onClose} subtitle="Prenotazioni" title="Nuova prenotazione" footer={<>
      <div style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Annulla</button>
      <button className="btn primary" onClick={submit}><Icon.check /> Crea prenotazione</button></>}>
      <div className="form-grid">
        <Field label="Pilota" wide><Input value={f.pilot} onChange={e => set("pilot", e.target.value)} placeholder="Nome e cognome" /></Field>
        <Field label="Aeromobile"><Select value={f.tail} onChange={e => set("tail", e.target.value)}>
          {TAILS.filter(t => t.status !== "aog").map(t => <option key={t.tail} value={t.tail}>{t.tail} · {t.model}</option>)}
        </Select></Field>
        <Field label="Istruttore"><Select value={f.cfi} onChange={e => set("cfi", e.target.value)}>
          <option value="—">— nessuno / solo —</option>
          {INSTRUCTORS.map(i => <option key={i.id} value={i.init}>{i.name}</option>)}
        </Select></Field>
        <Field label="Tipo"><Select value={f.kind} onChange={e => set("kind", e.target.value)}>
          <option>Noleggio</option><option>Scuola</option><option>Solo</option><option>IFR</option><option>ME</option>
        </Select></Field>
        <Field label="Data"><Input type="date" value={f.date} onChange={e => set("date", e.target.value)} /></Field>
        <Field label="Inizio (locale)"><Input type="time" value={f.start} onChange={e => set("start", e.target.value)} /></Field>
        <Field label="Durata"><div className="input-group"><Input type="number" step="0.1" min="0.5" value={f.dur} onChange={e => set("dur", e.target.value)} /><span className="suffix">h</span></div></Field>
      </div>
    </SlideOver>
  );
}

function LogArrivalForm({ open, onClose, onCreate }) {
  const blank = { callsign: "", type: "", origin: "", dest: "LIML", pilot: "", phone: "", eta: "Oggi · ", etd: "Oggi · ", status: "inbound" };
  const [f, setF] = React.useState(blank);
  React.useEffect(() => { if (open) setF(blank); }, [open]);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const submit = () => {
    onCreate({ id: rid("VIS", 413, 80), ...f, callsign: (f.callsign || "I-NEW").toUpperCase() });
    onClose();
  };
  return (
    <SlideOver open={open} onClose={onClose} subtitle="Voli in transito" title="Registra arrivo" footer={<>
      <div style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Annulla</button>
      <button className="btn primary" onClick={submit}><Icon.check /> Registra movimento</button></>}>
      <div className="form-grid">
        <Field label="Nominativo"><Input value={f.callsign} onChange={e => set("callsign", e.target.value.toUpperCase())} placeholder="I-XXXX" /></Field>
        <Field label="Tipo aeromobile"><Input value={f.type} onChange={e => set("type", e.target.value)} placeholder="C172, DA42…" /></Field>
        <Field label="Origine"><Input value={f.origin} onChange={e => set("origin", e.target.value.toUpperCase())} placeholder="ICAO" /></Field>
        <Field label="Destinazione"><Input value={f.dest} onChange={e => set("dest", e.target.value.toUpperCase())} placeholder="ICAO" /></Field>
        <Field label="Pilota" wide><Input value={f.pilot} onChange={e => set("pilot", e.target.value)} placeholder="Nome e cognome" /></Field>
        <Field label="Telefono di contatto" wide><Input value={f.phone} onChange={e => set("phone", e.target.value)} placeholder="+39 …" /></Field>
        <Field label="Arrivo (ETA)"><Input value={f.eta} onChange={e => set("eta", e.target.value)} placeholder="Oggi · 14:10" /></Field>
        <Field label="Partenza (ETD)"><Input value={f.etd} onChange={e => set("etd", e.target.value)} placeholder="Domani" /></Field>
        <Field label="Stato" wide><Select value={f.status} onChange={e => set("status", e.target.value)}>
          <option value="inbound">In arrivo</option><option value="on-ground">Al suolo</option>
          <option value="expected">Atteso</option><option value="departed">Partito</option>
        </Select></Field>
      </div>
    </SlideOver>
  );
}

function ManualPPRForm({ open, onClose, onCreate }) {
  const blank = { requester: "", contact: "", callsign: "", type: "", arrival: "", departure: "", pob: "1", note: "" };
  const [f, setF] = React.useState(blank);
  React.useEffect(() => { if (open) setF(blank); }, [open]);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const submit = () => {
    onCreate({
      id: rid("PPR", 882, 200), requester: f.requester || "Nuovo richiedente", contact: f.contact,
      callsign: (f.callsign || "I-XXXX").toUpperCase(), type: f.type || "—",
      arrival: f.arrival || "—", departure: f.departure || "—", pob: Number(f.pob) || 1,
      status: "pending", note: f.note, source: "manual"
    });
    onClose();
  };
  return (
    <SlideOver open={open} onClose={onClose} subtitle="Richieste PPR" title="PPR manuale" footer={<>
      <div style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Annulla</button>
      <button className="btn primary" onClick={submit}><Icon.check /> Aggiungi</button></>}>
      <div className="form-grid">
        <Field label="Richiedente" wide><Input value={f.requester} onChange={e => set("requester", e.target.value)} placeholder="Nome e cognome" /></Field>
        <Field label="Contatto" wide><Input value={f.contact} onChange={e => set("contact", e.target.value)} placeholder="Email o telefono" /></Field>
        <Field label="Nominativo"><Input value={f.callsign} onChange={e => set("callsign", e.target.value.toUpperCase())} placeholder="I-XXXX" /></Field>
        <Field label="Tipo aeromobile"><Input value={f.type} onChange={e => set("type", e.target.value)} placeholder="TB-20, C182…" /></Field>
        <Field label="Arrivo"><Input value={f.arrival} onChange={e => set("arrival", e.target.value)} placeholder="24 Apr · 15:30" /></Field>
        <Field label="Partenza"><Input value={f.departure} onChange={e => set("departure", e.target.value)} placeholder="25 Apr · 11:00" /></Field>
        <Field label="Persone a bordo"><Input type="number" min="1" value={f.pob} onChange={e => set("pob", e.target.value)} /></Field>
        <Field label="Nota" wide><textarea className="input" rows="3" value={f.note} onChange={e => set("note", e.target.value)} placeholder="Carburante, sosta notturna, handling…" /></Field>
      </div>
    </SlideOver>
  );
}

function NewTransactionForm({ open, onClose, onCreate }) {
  const blank = { date: "2026-04-22", pilot: PILOTS[0]?.name || "", type: "Volo", desc: "", amount: "", method: "Conto" };
  const [f, setF] = React.useState(blank);
  React.useEffect(() => { if (open) setF(blank); }, [open]);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const isPayment = f.type === "Pagamento";
  const submit = () => {
    const val = Math.abs(parseFloat(f.amount || 0));
    onCreate({
      id: rid("TX", 4843, 200), date: f.date, pilot: f.pilot, type: f.type,
      desc: f.desc || f.type, amount: isPayment ? -val : val, method: f.method,
      status: isPayment ? "cleared" : "posted"
    });
    onClose();
  };
  return (
    <SlideOver open={open} onClose={onClose} subtitle="Contabilità" title="Nuova transazione" footer={<>
      <div style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Annulla</button>
      <button className="btn primary" onClick={submit}><Icon.check /> Registra transazione</button></>}>
      <div className="form-grid">
        <Field label="Data"><Input type="date" value={f.date} onChange={e => set("date", e.target.value)} /></Field>
        <Field label="Tipo"><Select value={f.type} onChange={e => set("type", e.target.value)}>
          <option value="Volo">Volo</option><option value="Istruzione">Istruzione</option><option value="Iscrizione">Iscrizione</option>
          <option value="Carburante">Carburante</option><option value="Tassa d'atterraggio">Tassa d'atterraggio</option><option value="Pagamento">Pagamento</option>
        </Select></Field>
        <Field label="Pilota" wide><Select value={f.pilot} onChange={e => set("pilot", e.target.value)}>
          {PILOTS.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
        </Select></Field>
        <Field label="Descrizione" wide><Input value={f.desc} onChange={e => set("desc", e.target.value)} placeholder={isPayment ? "Pagamento carta — Visa ••00" : "I-AERO · Scuola 1.5h"} /></Field>
        <Field label={isPayment ? "Importo pagamento" : "Importo addebito"}>
          <div className="input-group"><span className="prefix">€</span><Input type="number" step="1" value={f.amount} onChange={e => set("amount", e.target.value)} /></div>
        </Field>
        <Field label="Metodo"><Select value={f.method} onChange={e => set("method", e.target.value)}>
          <option>Conto</option><option>Carta</option><option>Bonifico</option><option>Contanti</option>
        </Select></Field>
      </div>
    </SlideOver>
  );
}

function NewLogbookForm({ open, onClose, onCreate }) {
  const MON_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const toLbDate = (iso) => { const [y,m,d]=iso.split("-"); return `${+d} ${MON_EN[+m-1]} ${y.slice(2)}`; };
  const blank = { date:"2026-04-21", tail: TAILS[0]?.tail || "", pilot:"", cfi:"—", dep:"LIMC", arr:"", kind:"Scuola", dur:"1.5", takeoffs:"1", landings:"1", cost:"" };
  const [f, setF] = React.useState(blank);
  React.useEffect(() => { if (open) setF(blank); }, [open]);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const submit = () => {
    onCreate({
      date: toLbDate(f.date), tail: f.tail, pilot: f.pilot || "Nuovo pilota", cfi: f.cfi,
      dep: (f.dep || "").toUpperCase(), arr: (f.arr || "").toUpperCase(), kind: f.kind,
      dur: parseFloat(f.dur || 0), takeoffs: Number(f.takeoffs) || 0, landings: Number(f.landings) || 0,
      cost: Math.round(Number(f.cost) || 0)
    });
    onClose();
  };
  return (
    <SlideOver open={open} onClose={onClose} subtitle="Registro voli" title="Nuova voce" footer={<>
      <div style={{ flex: 1 }} /><button className="btn" onClick={onClose}>Annulla</button>
      <button className="btn primary" onClick={submit}><Icon.check /> Aggiungi voce</button></>}>
      <div className="form-grid">
        <Field label="Data"><Input type="date" value={f.date} onChange={e => set("date", e.target.value)} /></Field>
        <Field label="Aeromobile"><Select value={f.tail} onChange={e => set("tail", e.target.value)}>
          {TAILS.map(t => <option key={t.tail} value={t.tail}>{t.tail} · {t.model}</option>)}
        </Select></Field>
        <Field label="Pilota" wide><Input value={f.pilot} onChange={e => set("pilot", e.target.value)} placeholder="Es. A. Okafor" /></Field>
        <Field label="Istruttore"><Select value={f.cfi} onChange={e => set("cfi", e.target.value)}>
          <option value="—">— nessuno / solo —</option>
          {INSTRUCTORS.map(i => <option key={i.id} value={i.init}>{i.init} · {i.name}</option>)}
        </Select></Field>
        <Field label="Tipo"><Select value={f.kind} onChange={e => set("kind", e.target.value)}>
          <option>Scuola</option><option>Solo</option><option>IFR</option><option>ME</option><option>Noleggio</option>
        </Select></Field>
        <Field label="Partenza"><Input value={f.dep} onChange={e => set("dep", e.target.value.toUpperCase())} placeholder="ICAO" /></Field>
        <Field label="Arrivo"><Input value={f.arr} onChange={e => set("arr", e.target.value.toUpperCase())} placeholder="ICAO" /></Field>
        <Field label="Durata"><div className="input-group"><Input type="number" step="0.1" min="0" value={f.dur} onChange={e => set("dur", e.target.value)} /><span className="suffix">h</span></div></Field>
        <Field label="Decolli"><Input type="number" min="0" value={f.takeoffs} onChange={e => set("takeoffs", e.target.value)} /></Field>
        <Field label="Atterraggi"><Input type="number" min="0" value={f.landings} onChange={e => set("landings", e.target.value)} /></Field>
        <Field label="Costo"><div className="input-group"><span className="prefix">€</span><Input type="number" min="0" value={f.cost} onChange={e => set("cost", e.target.value)} /></div></Field>
      </div>
    </SlideOver>
  );
}

Object.assign(window, { NewBookingForm, LogArrivalForm, ManualPPRForm, NewTransactionForm, NewLogbookForm });
