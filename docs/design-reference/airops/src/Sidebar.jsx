function Sidebar({ section, onSection, role }){
  const attn = (() => {
    const dl = s => Math.round((new Date(s) - NOW_REF) / 86400000);
    let n = 0;
    PILOTS.forEach(p => {
      if (p.medicalExp && p.medicalExp!=="—" && dl(p.medicalExp)<=60) n++;
      if (p.licenseExp && p.licenseExp!=="—" && dl(p.licenseExp)<=60) n++;
    });
    RATING_EXPIRY.forEach(r => { if (dl(r.expires)<=60) n++; });
    return n;
  })();

  const groups = [
    { label: "Operazioni", items: [
      { id: "overview",     label: "Panoramica",       icon: <Icon.dashboard/> },
      { id: "schedule",     label: "Pianificazione",   icon: <Icon.calendar/>, badge: "24" },
      { id: "ppr",          label: "Richieste PPR",    icon: <Icon.doc/>,      badge: "3" },
      { id: "visiting",     label: "Voli in transito", icon: <Icon.plane/>,    badge: "7" },
    ]},
    { label: "Anagrafiche", items: [
      { id: "pilots",       label: "Piloti",           icon: <Icon.users/>,    badge: "14" },
      { id: "instructors",  label: "Istruttori",       icon: <Icon.compass/>,  badge: "5" },
      { id: "fleet",        label: "Aeromobili",       icon: <Icon.fleet/>,    badge: "8" },
      { id: "scadenze",     label: "Scadenze",         icon: <Icon.clock/>,    badge: attn ? String(attn) : null },
    ]},
    { label: "Archivio", items: [
      { id: "logbook",      label: "Registro voli",    icon: <Icon.book/> },
      { id: "billing",      label: "Contabilità",      icon: <Icon.cash/> },
      { id: "reports",      label: "Statistiche",      icon: <Icon.chart/> },
    ]},
    { label: "Sistema", items: [
      { id: "settings",     label: "Impostazioni",     icon: <Icon.gear/> },
    ]},
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Icon.logo/></div>
        <div>
          <div className="brand-name">AirOps</div>
          <div className="brand-sub">LIML · CONSOLE AEROPORTUALE</div>
        </div>
      </div>

      {groups.map(g => (
        <div key={g.label} className="nav-group">
          <div className="nav-label">{g.label}</div>
          {g.items.map(it => (
            <div key={it.id} className={`nav-item ${section===it.id?"active":""}`} onClick={()=>onSection(it.id)}>
              {it.icon}<span className="label-txt">{it.label}</span>
            </div>
          ))}
        </div>
      ))}

      <div className="weather-card">
        <div className="row">
          <span className="weather-title">Meteo campo</span>
          <span className="weather-station">LIML</span>
        </div>
        <div style={{display:"flex", alignItems:"baseline", gap:10}}>
          <div style={{fontFamily:"var(--font-ui)", fontWeight:600, fontSize:28, lineHeight:1, letterSpacing:"-0.02em"}}>14<span style={{fontSize:14,color:"var(--ink-3)", fontWeight:500}}>°C</span></div>
          <div className="weather-flight"><span className="flight-dot vfr"/>VFR</div>
        </div>
        <div className="weather-metar">
          LIML 211453Z 29008KT 9999 FEW035 14/09 Q1017
        </div>
        <div className="row" style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--ink-3)"}}>
          <span>WIND 290@08</span><span>VIS 10KM</span><span>QNH 1017</span>
        </div>
      </div>
    </aside>
  );
}

window.Sidebar = Sidebar;
