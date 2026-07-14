// Small shared primitives

function Badge({ tone="", children, dot=false }){
  return (
    <span className={`badge ${tone}`}>
      {dot && <span className="b-dot" />}
      {children}
    </span>
  );
}

function Avatar({ init, color="" }){
  return <div className={`avatar ${color}`}>{init}</div>;
}

function Spark({ data=[3,5,4,7,6,8,10,9,11,13], w=64, h=20, color="currentColor" }){
  const max = Math.max(...data), min = Math.min(...data);
  const nx = (i) => (i/(data.length-1))*w;
  const ny = (v) => h - ((v-min)/Math.max(1,max-min))*h;
  const d = data.map((v,i)=> `${i===0?"M":"L"} ${nx(i).toFixed(1)} ${ny(v).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" stroke={color} strokeWidth="1.3">
      <path d={d} />
    </svg>
  );
}

function KPI({ label, value, unit, delta, trend, sparkData }){
  const sparkColor = trend==="up" ? "var(--ok)" : trend==="down" ? "var(--bad)" : "var(--ink-4)";
  return (
    <div className="kpi">
      {sparkData && <div className="kpi-spark"><Spark data={sparkData} color={sparkColor}/></div>}
      <div className="kpi-label">{label}</div>
      <div className="kpi-value num">{value}{unit && <span className="unit">{unit}</span>}</div>
      {delta && (
        <div className="kpi-delta">
          <span className={trend==="up"?"up":trend==="down"?"down":""}>{delta}</span>
        </div>
      )}
    </div>
  );
}

function ToastHost(){
  const [items, setItems] = React.useState([]);
  React.useEffect(()=>{
    const on = (e)=>{
      const d = e.detail||{};
      const id = Date.now() + Math.random();
      setItems(list => [...list, { id, msg: d.msg||"", tone: d.tone||"ok" }]);
      setTimeout(()=> setItems(list => list.filter(t=>t.id!==id)), 2600);
    };
    window.addEventListener("airops-toast", on);
    return ()=> window.removeEventListener("airops-toast", on);
  }, []);
  return (
    <div className="toast-host">
      {items.map(t => (
        <div key={t.id} className={`toast ${t.tone}`}>
          <span className="toast-dot"/>{t.msg}
        </div>
      ))}
    </div>
  );
}
window.showToast = (msg, tone) => window.dispatchEvent(new CustomEvent("airops-toast", { detail:{ msg, tone } }));

Object.assign(window, { Badge, Avatar, Spark, KPI, ToastHost });
