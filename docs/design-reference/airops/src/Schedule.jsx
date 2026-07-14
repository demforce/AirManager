function Schedule(){
  const START = 7, END = 21;
  const TODAY_REF = React.useMemo(()=>new Date(2026, 3, 21), []); // Tue Apr 21 2026 (data anchor)
  const [now, setNow] = React.useState(() => 14.28);
  const [view, setView] = React.useState("day"); // day | week
  const [date, setDate] = React.useState(TODAY_REF);
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [filterKind, setFilterKind] = React.useState("all"); // all | training | rental | solo
  const [filterCfi, setFilterCfi] = React.useState("all");
  const [newFlight, setNewFlight] = React.useState(false);
  const [calOpen, setCalOpen] = React.useState(false);
  const [calCursor, setCalCursor] = React.useState(()=>new Date(2026, 3, 1));

  React.useEffect(()=>{
    // Whenever the calendar opens, snap the cursor month to whatever's selected.
    if (calOpen) setCalCursor(new Date(date.getFullYear(), date.getMonth(), 1));
  }, [calOpen]);

  React.useEffect(()=>{
    const id = setInterval(()=> setNow(n => {
      const nx = n + 0.0025;
      return nx > END ? START + 0.3 : nx;
    }), 2500);
    return ()=> clearInterval(id);
  },[]);

  const ticks = [];
  for (let h = START; h <= END; h++) ticks.push(h);
  const pct = (t) => ((t - START) / (END - START)) * 100;

  const kindClass = (f) => {
    if (f.kind === "aog") return "aog-block";
    if (f.state === "active") return "active";
    if (f.state === "complete") return "complete";
    if (f.kind === "solo" || f.kind === "rental") return "solo";
    return "";
  };
  const cfiName = (id) => INSTRUCTORS.find(x=>x.id===id)?.init || id?.toUpperCase() || "—";
  const nowHH = Math.floor(now), nowMM = Math.floor((now-nowHH)*60);
  const nowLabel = `${String(nowHH).padStart(2,"0")}:${String(nowMM).padStart(2,"0")}`;

  const flightVisible = (f) => {
    if (f.kind === "aog") return true;
    if (filterKind !== "all"){
      if (filterKind === "training" && !["dual","ifr","multi"].includes(f.kind)) return false;
      if (filterKind === "rental"   && f.kind !== "rental") return false;
      if (filterKind === "solo"     && f.kind !== "solo")   return false;
    }
    if (filterCfi !== "all" && f.cfi !== filterCfi) return false;
    return true;
  };

  const filterCount = (filterKind!=="all"?1:0) + (filterCfi!=="all"?1:0);

  // ---------- date helpers ----------
  const dayMs = 24*60*60*1000;
  const dayOffset = Math.round((date - TODAY_REF) / dayMs);
  const isToday = dayOffset === 0;
  const isPast = dayOffset < 0;
  const dateLabel = date.toLocaleDateString("it", { weekday: "short", day: "2-digit", month: "short" }).toUpperCase();
  const fullDateLabel = date.toLocaleDateString("it", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const stepDay = (delta) => setDate(d => { const nd = new Date(d); nd.setDate(d.getDate()+delta); return nd; });

  // Per-day flights: real for today, deterministically thinned for other days
  const flightsForDay = React.useMemo(()=>{
    if (dayOffset === 0) return FLIGHTS;
    const dow = date.getDay();
    const keepRatio = ({0:0.55, 1:0.95, 2:1.0, 3:0.9, 4:0.85, 5:0.8, 6:0.6})[dow] ?? 1;
    const seed = Math.abs(dayOffset) * 7 + dow;
    const base = FLIGHTS.filter(f => f.kind !== "aog");
    const filtered = base.filter((_, i) => ((i*13 + seed*5) % 100) / 100 < keepRatio);
    return filtered.map(f => ({ ...f, state: isPast ? "complete" : "scheduled" }))
      .concat(FLIGHTS.filter(f => f.kind === "aog"));
  }, [dayOffset, isPast, date]);

  // Week view: 7 days starting Monday of week containing `date`
  const weekDays = React.useMemo(()=>{
    const start = new Date(date);
    const wd = start.getDay();
    start.setDate(start.getDate() + (wd === 0 ? -6 : 1 - wd));
    return Array.from({length:7}, (_,i)=>{
      const d = new Date(start); d.setDate(start.getDate()+i);
      const dow = d.getDay();
      const ratio = ({0:0.55, 1:0.95, 2:1.0, 3:0.9, 4:0.85, 5:0.8, 6:0.6})[dow] ?? 1;
      return {
        date: d,
        label: d.toLocaleDateString("it", {weekday:"short"}).toUpperCase(),
        num: d.getDate(),
        isToday: d.toDateString() === TODAY_REF.toDateString(),
        isSelected: d.toDateString() === date.toDateString(),
        flights: Math.round(FLIGHTS.filter(f=>f.kind!=="aog").length * ratio),
        pob: 12 + ((d.getDate()*5) % 9),
      };
    });
  }, [date]);

  const weekRangeLabel = React.useMemo(()=>{
    const start = weekDays[0].date, end = weekDays[6].date;
    const ws = `${start.getDate()} ${start.toLocaleDateString("it",{month:"short"}).toUpperCase()}`;
    const we = `${end.getDate()} ${end.toLocaleDateString("it",{month:"short"}).toUpperCase()}`;
    const tmp = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
    tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay()||7));
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
    const wk = Math.ceil((((tmp - yearStart) / 86400000) + 1)/7);
    return `SETT. ${wk} · ${ws}–${we} · LIML`;
  }, [weekDays]);

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">{isToday ? "Programma di oggi" : "Programma"}</div>
        <span className="card-sub">{view==="day" ? `${dateLabel} · LIML` : weekRangeLabel}</span>
        <div className="spacer" />

        {/* Date navigator with calendar popover */}
        <div className="date-nav" style={{position:"relative"}}>
          <button className="iconbtn" onClick={()=>stepDay(view==="week"?-7:-1)} aria-label="Precedente"><Icon.chevL/></button>
          <button className="btn date-pick-btn" onClick={()=>setCalOpen(o=>!o)} title={fullDateLabel}>
            <Icon.calendar/>
            <span>{view==="week" ? weekRangeLabel.replace(" · LIML","") : dateLabel}</span>
          </button>
          <button className="iconbtn" onClick={()=>stepDay(view==="week"?7:1)} aria-label="Successivo"><Icon.chevR/></button>
          {calOpen && (
            <>
              <div className="popover-scrim" onClick={()=>setCalOpen(false)}/>
              <CalendarPopover
                cursor={calCursor}
                setCursor={setCalCursor}
                selected={date}
                today={TODAY_REF}
                onPick={(d)=>{ setDate(d); setCalOpen(false); }}
                onToday={()=>{ setDate(TODAY_REF); setCalCursor(new Date(TODAY_REF.getFullYear(), TODAY_REF.getMonth(), 1)); setCalOpen(false); }}
              />
            </>
          )}
        </div>

        {/* Filters popover */}
        <div style={{position:"relative"}}>
          <button className={`btn ${filterCount?"primary":""}`} onClick={()=>setFilterOpen(o=>!o)}>
            <Icon.filter/> Filtri{filterCount ? ` · ${filterCount}` : ""}
          </button>
          {filterOpen && (
            <>
              <div className="popover-scrim" onClick={()=>setFilterOpen(false)}/>
              <div className="popover">
                <div className="pop-row">
                  <div className="fld-label">Tipo volo</div>
                  <div className="segmented">
                    {[["all","Tutti"],["training","Scuola"],["rental","Noleggio"],["solo","Solo"]].map(([k,l])=>(
                      <button key={k} className={filterKind===k?"on":""} onClick={()=>setFilterKind(k)}>{l}</button>
                    ))}
                  </div>
                </div>
                <div className="pop-row">
                  <div className="fld-label">Istruttore</div>
                  <div className="segmented" style={{flexWrap:"wrap"}}>
                    <button className={filterCfi==="all"?"on":""} onClick={()=>setFilterCfi("all")}>Tutti</button>
                    {INSTRUCTORS.map(i => (
                      <button key={i.id} className={filterCfi===i.id?"on":""} onClick={()=>setFilterCfi(i.id)}>{i.init}</button>
                    ))}
                  </div>
                </div>
                <div className="pop-foot">
                  <button className="btn" onClick={()=>{setFilterKind("all"); setFilterCfi("all");}}>Reimposta</button>
                  <button className="btn primary" onClick={()=>setFilterOpen(false)}>Fatto</button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Day · Week toggle */}
        <div className="segmented">
          <button className={view==="day"?"on":""} onClick={()=>setView("day")}>Giorno</button>
          <button className={view==="week"?"on":""} onClick={()=>setView("week")}>Settimana</button>
        </div>

        <button className="btn primary" onClick={()=>setNewFlight(true)}><Icon.plus/> Nuovo volo</button>
      </div>

      {view==="day" && (
        <div className="schedule">
          <div className="sched-axis">
            <div className="axis-label">Aeromobile / Ris.</div>
            <div className="axis-ticks" style={{gridTemplateColumns: `repeat(${ticks.length-1}, 1fr)`}}>
              {ticks.slice(0,-1).map((h) => (
                <div key={h} className="tick">{String(h).padStart(2,"0")}:00</div>
              ))}
            </div>
          </div>
          {TAILS.map(ac => {
            const flights = flightsForDay.filter(f => f.tail === ac.tail).filter(flightVisible);
            const isAog = ac.status === "aog";
            return (
              <div key={ac.tail} className="sched-row">
                <div className="sched-resource">
                  <div className="res-meta">
                    <div className="tail">{ac.tail}</div>
                    <div className="res-type">{ac.model}</div>
                    <div className={`res-status ${isAog?"aog":""}`}>
                      <span className="pill-dot"/>{isAog ? "AOG" : ac.status==="reserved"?"RISERVATO":"DISPONIBILE"}
                    </div>
                  </div>
                </div>
                <div className="sched-track">
                  {ticks.map((h)=>(
                    <div key={h} className="grid-line" style={{left: `${pct(h)}%`}} />
                  ))}
                  {isToday && <div className="now-line" data-time={`${nowLabel} L`} style={{left: `${pct(now)}%`}} />}
                  {flights.map((f, i) => {
                    const left = pct(f.start), right = pct(f.end);
                    const w = right - left;
                    return (
                      <div key={i} className={`flight ${kindClass(f)}`}
                           style={{left: `${left}%`, width: `calc(${w}% - 3px)`}}
                           title={`${f.route}`}>
                        <div className="f-head">
                          <span>{f.pilot || f.route}</span>
                          <span className="mono">{cfiName(f.cfi)}</span>
                        </div>
                        <div className="f-sub">
                          {String(Math.floor(f.start)).padStart(2,"0")}:{String(Math.round((f.start%1)*60)).padStart(2,"0")}
                          {" – "}
                          {String(Math.floor(f.end)).padStart(2,"0")}:{String(Math.round((f.end%1)*60)).padStart(2,"0")}
                          {f.kind === "solo" && " · SOLO"}
                          {f.kind === "aog" && ` · ${f.route}`}
                          {f.kind === "rental" && " · NOLEGGIO"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view==="week" && (
        <div className="week-grid">
          {weekDays.map((d,i)=>(
            <div key={i} className={`week-day ${d.isToday?"today":""} ${d.isSelected?"selected":""}`} onClick={()=>{ setDate(d.date); setView("day"); }}>
              <div className="wd-head">
                <div className="wd-label mono">{d.label}</div>
                <div className="wd-num">{d.num}</div>
              </div>
              <div className="wd-meta">
                <div><span className="num">{d.flights}</span><span className="lbl">voli</span></div>
                <div><span className="num">{d.pob}</span><span className="lbl">pob</span></div>
              </div>
              <div className="wd-bars">
                {Array.from({length:Math.min(d.flights,8)}).map((_,j)=>(
                  <div key={j} className={`wd-bar ${j%4===0?"a":j%3===0?"b":""}`} style={{height: `${30 + (j*13)%50}%`}}/>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <NewFlightSlideOver open={newFlight} onClose={()=>setNewFlight(false)}/>
    </div>
  );
}

function NewFlightSlideOver({ open, onClose }){
  const [form, setForm] = React.useState({
    pilot: "", tail: TAILS[0]?.tail || "", cfi: INSTRUCTORS[0]?.id || "",
    kind: "dual", date: "2026-04-22", start: "09:00", dur: "1.5", route: "LIML→LIME→LIML", note: ""
  });
  const set = (k,v) => setForm(f=>({...f, [k]: v}));
  return (
    <SlideOver open={open} onClose={onClose} subtitle="Programma" title="Nuovo volo" footer={
      <>
        <div style={{flex:1}}/>
        <button className="btn" onClick={onClose}>Annulla</button>
        <button className="btn primary" onClick={()=>{showToast("Volo pianificato"); onClose();}}><Icon.check/> Pianifica</button>
      </>
    }>
      <div className="form-grid">
        <div className="fld wide">
          <div className="fld-label">Pilota</div>
          <input className="input" placeholder="Cognome o nominativo" value={form.pilot} onChange={e=>set("pilot",e.target.value)}/>
        </div>
        <div className="fld">
          <div className="fld-label">Aeromobile</div>
          <select className="input" value={form.tail} onChange={e=>set("tail",e.target.value)}>
            {TAILS.filter(t=>t.status!=="aog").map(t=>(<option key={t.tail} value={t.tail}>{t.tail} · {t.model}</option>))}
          </select>
        </div>
        <div className="fld">
          <div className="fld-label">Istruttore</div>
          <select className="input" value={form.cfi} onChange={e=>set("cfi",e.target.value)}>
            <option value="">— sé / solo —</option>
            {INSTRUCTORS.map(i=>(<option key={i.id} value={i.id}>{i.name}</option>))}
          </select>
        </div>
        <div className="fld">
          <div className="fld-label">Tipo</div>
          <div className="segmented">
            {[["dual","Doppio"],["solo","Solo"],["rental","Noleggio"],["ifr","IFR"],["multi","ME"]].map(([k,l])=>(
              <button key={k} className={form.kind===k?"on":""} onClick={()=>set("kind",k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="fld">
          <div className="fld-label">Data</div>
          <input className="input" type="date" value={form.date} onChange={e=>set("date",e.target.value)}/>
        </div>
        <div className="fld">
          <div className="fld-label">Inizio (locale)</div>
          <input className="input" type="time" value={form.start} onChange={e=>set("start",e.target.value)}/>
        </div>
        <div className="fld">
          <div className="fld-label">Durata</div>
          <div className="input-group">
            <input className="input" type="number" step="0.1" min="0.5" value={form.dur} onChange={e=>set("dur",e.target.value)}/>
            <div className="suffix">h</div>
          </div>
        </div>
        <div className="fld wide">
          <div className="fld-label">Rotta</div>
          <input className="input" value={form.route} onChange={e=>set("route",e.target.value)}/>
        </div>
        <div className="fld wide">
          <div className="fld-label">Note (facoltative)</div>
          <textarea className="input" rows="3" placeholder="Briefing meteo, istruzioni particolari…" value={form.note} onChange={e=>set("note",e.target.value)}/>
        </div>
      </div>
    </SlideOver>
  );
}

Object.assign(window, { Schedule, NewFlightSlideOver });

// ---------- Calendar popover ----------
function CalendarPopover({ cursor, setCursor, selected, today, onPick, onToday }){
  const monthLabel = cursor.toLocaleDateString("it", { month: "long", year: "numeric" });
  const stepMonth = (delta) => setCursor(c => new Date(c.getFullYear(), c.getMonth()+delta, 1));

  // Build a 6x7 grid starting Monday of the week containing day 1
  const cells = React.useMemo(()=>{
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const wd = first.getDay(); // 0..6 (sun..sat)
    const offset = (wd === 0 ? -6 : 1 - wd);
    const start = new Date(first); start.setDate(first.getDate()+offset);
    return Array.from({length: 42}, (_,i)=>{
      const d = new Date(start); d.setDate(start.getDate()+i);
      return d;
    });
  }, [cursor]);

  const same = (a,b) => a.toDateString() === b.toDateString();

  return (
    <div className="cal-popover" onClick={e=>e.stopPropagation()}>
      <div className="cal-head">
        <button className="iconbtn" onClick={()=>stepMonth(-1)} aria-label="Mese precedente"><Icon.chevL/></button>
        <div className="cal-month">{monthLabel}</div>
        <button className="iconbtn" onClick={()=>stepMonth(1)} aria-label="Mese successivo"><Icon.chevR/></button>
      </div>
      <div className="cal-dows">
        {["LUN","MAR","MER","GIO","VEN","SAB","DOM"].map(d => <div key={d} className="cal-dow">{d}</div>)}
      </div>
      <div className="cal-grid">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isSel = same(d, selected);
          const isToday = same(d, today);
          return (
            <button
              key={i}
              className={`cal-cell ${inMonth?"":"out"} ${isSel?"sel":""} ${isToday?"today":""}`}
              onClick={()=>onPick(d)}
            >{d.getDate()}</button>
          );
        })}
      </div>
      <div className="cal-foot">
        <button className="btn" onClick={onToday}>Oggi</button>
      </div>
    </div>
  );
}
