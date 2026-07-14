const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "role": "admin",
  "theme": "light"
}/*EDITMODE-END*/;

function AdminOverview({ onSection }){
  const [dispatch, setDispatch] = React.useState(false);
  const pendingPPR = PPRS.filter(r=>r.status==="pending").length;
  const onGround = VISITING.filter(v=>v.status==="on-ground").length;
  const pendingBkg = BOOKINGS.filter(b=>b.state==="pending").length;
  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <h1>Panoramica operativa</h1>
          <div className="sub"><span className="dot"/>LIML · 1 AOG · {pendingPPR} PPR in attesa · {onGround} in transito al suolo</div>
        </div>
        <div style={{display:"flex", gap:8}}>
          <button className="btn primary" onClick={()=>setDispatch(true)}><Icon.plus/> Pianifica volo</button>
        </div>
      </div>
      <div className="kpi-row">
        <KPI label="Voli oggi" value={FLIGHTS.filter(f=>f.kind!=="aog").length} unit="pianificati" delta="▲ 3 vs media" trend="up" sparkData={[14,18,16,20,17,22,19,24]}/>
        <KPI label="Flotta disponibile" value={TAILS.filter(t=>t.status==="available").length} unit={`/ ${TAILS.length}`} delta="1 AOG · I-FOXT" trend="down"/>
        <KPI label="PPR in attesa" value={pendingPPR} delta="più vecchia 6h fa"/>
        <KPI label="Prenotazioni in attesa" value={pendingBkg} delta="da approvare"/>
        <KPI label="Ricavi del mese" value="€148,2k" delta="+12,4% su mese prec." trend="up" sparkData={[30,40,50,55,80,90,110,148]}/>
      </div>
      <Schedule/>
      <BookingsTable/>
      <div className="split">
        <ScadenzeWidget onOpen={()=>onSection && onSection("scadenze")}/>
        <FleetCard/>
      </div>
      <NewFlightSlideOver open={dispatch} onClose={()=>setDispatch(false)}/>
    </>
  );
}

function App(){
  const [state, setState] = React.useState(() => {
    try { return { ...TWEAK_DEFAULTS, ...JSON.parse(localStorage.getItem("airops-state") || "{}") }; }
    catch { return TWEAK_DEFAULTS; }
  });
  const [section, setSection] = React.useState(() => localStorage.getItem("airops-section") || "overview");
  const [editMode, setEditMode] = React.useState(false);
  const [editAircraft, setEditAircraft] = React.useState(null);
  const [editPilot, setEditPilot] = React.useState(null);
  const [profilePilot, setProfilePilot] = React.useState(null);
  const [editInstr, setEditInstr] = React.useState(null);
  const [profileInstr, setProfileInstr] = React.useState(null);

  React.useEffect(()=>{ localStorage.setItem("airops-state", JSON.stringify(state)); }, [state]);
  React.useEffect(()=>{ localStorage.setItem("airops-section", section); }, [section]);
  React.useEffect(()=>{
    document.body.setAttribute("data-theme", state.theme);
    document.body.setAttribute("data-role", state.role);
  }, [state.theme, state.role]);

  React.useEffect(()=>{
    const onMsg = (e) => {
      const d = e.data || {};
      if (d.type === "__activate_edit_mode") setEditMode(true);
      if (d.type === "__deactivate_edit_mode") setEditMode(false);
    };
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const setAndPersist = (next) => {
    setState(next);
    const edits = {};
    if (next.role !== state.role) edits.role = next.role;
    if (next.theme !== state.theme) edits.theme = next.theme;
    if (Object.keys(edits).length)
      window.parent.postMessage({ type: "__edit_mode_set_keys", edits }, "*");
  };
  const toggleTheme = () => setAndPersist({ ...state, theme: state.theme === "light" ? "dark" : "light" });

  const renderPage = () => {
    if (state.role === "pilot") return <PilotLanding/>;
    if (state.role === "instructor") return <InstructorView/>;
    if (section === "overview") return <AdminOverview onSection={setSection}/>;
    if (section === "schedule") return <>
      <div className="page-head"><div className="page-title-block"><h1>Pianificazione</h1><div className="sub">Trascina per pianificare · elenco prenotazioni sotto</div></div></div>
      <Schedule/><BookingsTable/>
    </>;
    if (section === "ppr") return <PPRView/>;
    if (section === "visiting") return <VisitingView/>;
    if (section === "pilots") return <PilotsView onEdit={setEditPilot} onProfile={setProfilePilot}/>;
    if (section === "instructors") return <InstructorsView onEdit={setEditInstr} onProfile={setProfileInstr}/>;
    if (section === "fleet") return <>
      <div className="page-head"><div className="page-title-block"><h1>Aeromobili</h1><div className="sub">{TAILS.length} totali · {TAILS.filter(t=>t.status==="available").length} disponibili · {TAILS.filter(t=>t.status==="aog").length} AOG</div></div></div>
      <FleetCard onEdit={setEditAircraft}/>
    </>;
    if (section === "logbook") return <LogbookView/>;
    if (section === "billing") return <BillingView/>;
    if (section === "reports") return <ReportsView/>;
    if (section === "scadenze") return <ScadenzeView/>;
    if (section === "settings") return <SettingsView/>;
    return null;
  };

  return (
    <div className="app" data-screen-label={`AirOps · ${state.role} · ${section}`}>
      <Sidebar section={section} onSection={setSection} role={state.role}/>
      <main className="main">
        <TopBar section={section} theme={state.theme} onTheme={toggleTheme} role={state.role}/>
        <div className="page">{renderPage()}</div>
      </main>
      {editMode && <Tweaks state={state} setState={setAndPersist} />}
      <ToastHost/>
      <AircraftEditor ac={editAircraft} onClose={()=>setEditAircraft(null)}/>
      <PilotEditor pilot={editPilot} onClose={()=>setEditPilot(null)}/>
      <PilotProfile pilot={profilePilot} onClose={()=>setProfilePilot(null)} onEdit={setEditPilot}/>
      <InstructorEditor ins={editInstr} onClose={()=>setEditInstr(null)}/>
      <InstructorProfile instructor={profileInstr} onClose={()=>setProfileInstr(null)} onEdit={setEditInstr}/>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
