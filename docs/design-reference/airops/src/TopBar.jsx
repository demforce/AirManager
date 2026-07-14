function TopBar({ section, theme, onTheme, role }){
  const titles = {
    overview:"Panoramica operativa", schedule:"Pianificazione", ppr:"Richieste PPR", visiting:"Voli in transito",
    pilots:"Piloti", instructors:"Istruttori", fleet:"Aeromobili",
    logbook:"Registro voli", billing:"Contabilità", reports:"Statistiche",
    scadenze:"Scadenze", settings:"Impostazioni",
  };
  const now = new Date(); const pad = n=>String(n).padStart(2,"0");
  const zulu = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}Z`;
  const who = role==="admin" ? {name:"Roberto Castellano · Responsabile Operazioni", init:"RC", color:"amber"}
            : role==="instructor" ? {name:"Jun Park · Istruttore", init:"JP", color:""}
            : {name:"Liam Marchetti · Pilota", init:"LM", color:"green"};
  return (
    <header className="topbar">
      <div className="crumbs">
        <span>AirOps</span><span className="sep">/</span>
        <span>LIML</span><span className="sep">/</span>
        <span className="cur">{titles[section] || "Panoramica"}</span>
      </div>
      <div className="topbar-spacer"/>
      <button className="iconbtn" title="Toggle theme" onClick={onTheme}>{theme==="light"?<Icon.moon/>:<Icon.sun/>}</button>
      <div className="user-chip" title={who.name}>
        <Avatar init={who.init} color={who.color}/>
        <span style={{fontSize:12.5, fontWeight:500}}>{who.name.split(" · ")[0]}</span>
      </div>
    </header>
  );
}

window.TopBar = TopBar;
