function Tweaks({ state, setState }){
  const set = (k,v) => setState({ ...state, [k]: v });
  return (
    <div className="tweaks">
      <div className="tweaks-title">
        <Icon.compass/> Tweaks
        <span style={{marginLeft:"auto", color:"var(--ink-4)", fontSize:10}}>AirOps</span>
      </div>
      <div className="tweak-row">
        <span className="label">Ruolo</span>
        <div className="segmented">
          <button className={state.role==="admin"?"on":""} onClick={()=>set("role","admin")}>Admin</button>
          <button className={state.role==="instructor"?"on":""} onClick={()=>set("role","instructor")}>CFI</button>
          <button className={state.role==="pilot"?"on":""} onClick={()=>set("role","pilot")}>Pilota</button>
        </div>
      </div>
      <div className="tweak-row">
        <span className="label">Tema</span>
        <div className="segmented">
          <button className={state.theme==="light"?"on":""} onClick={()=>set("theme","light")}>Chiaro</button>
          <button className={state.theme==="dark"?"on":""} onClick={()=>set("theme","dark")}>Scuro</button>
        </div>
      </div>
    </div>
  );
}
window.Tweaks = Tweaks;
