function BarChart({ data, labels, height=180, color="var(--ink)" }){
  const max = Math.max(...data);
  const w = 600, h = height, pad = 24;
  const bw = (w - pad*2) / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{width:"100%", height}}>
      {[0,0.25,0.5,0.75,1].map((p,i)=>(
        <line key={i} x1={pad} x2={w-pad} y1={pad + (h-pad*1.5)*p} y2={pad + (h-pad*1.5)*p}
              stroke="var(--border)" strokeDasharray={i===4?"":"2 3"} strokeWidth="0.8"/>
      ))}
      {data.map((v,i) => {
        const barH = ((v/max) * (h - pad*2));
        const x = pad + i*bw + 4;
        const y = h - pad*0.5 - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw-8} height={barH} rx="2" fill={color} opacity={i===data.length-1?1:0.85}/>
            <text x={x + (bw-8)/2} y={h - 6} fontSize="9" fontFamily="var(--font-mono)" fill="var(--ink-4)" textAnchor="middle">{labels[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}
function LineChart({ data, labels, height=180, color="var(--accent)" }){
  const max = Math.max(...data), min = Math.min(...data);
  const w = 600, h = height, pad = 24;
  const nx = (i) => pad + (i/(data.length-1)) * (w - pad*2);
  const ny = (v) => pad + (1 - (v-min)/Math.max(1,max-min)) * (h - pad*2);
  const path = data.map((v,i)=>`${i===0?"M":"L"} ${nx(i)} ${ny(v)}`).join(" ");
  const area = path + ` L ${nx(data.length-1)} ${h-pad} L ${nx(0)} ${h-pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{width:"100%", height}}>
      {[0,0.25,0.5,0.75,1].map((p,i)=>(
        <line key={i} x1={pad} x2={w-pad} y1={pad + (h-pad*2)*p} y2={pad + (h-pad*2)*p}
              stroke="var(--border)" strokeDasharray={i===4?"":"2 3"} strokeWidth="0.8"/>
      ))}
      <path d={area} fill={color} opacity="0.12"/>
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {data.map((v,i)=>(<circle key={i} cx={nx(i)} cy={ny(v)} r={i===data.length-1?3.5:2} fill={color}/>))}
      {labels.map((l,i)=>(<text key={i} x={nx(i)} y={h-6} fontSize="9" fontFamily="var(--font-mono)" fill="var(--ink-4)" textAnchor="middle">{l}</text>))}
    </svg>
  );
}

function RankBars({ title, sub, rows, metrics, labelCol=110, monoLabel=false, period="month" }){
  const [mi, setMi] = React.useState(0);
  const m = metrics[mi];
  const val = (r) => period==="year" ? r[m.yField] : r[m.mField];
  const sorted = [...rows].sort((a,b)=> val(b)-val(a));
  const max = Math.max(1, ...sorted.map(val));
  const fmtV = (r) => m.money ? `€${Math.round(val(r)).toLocaleString("it-IT")}` : `${val(r).toFixed(1)}h`;
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">{title}</div>
        <span className="card-sub">{sub}</span>
        <div className="spacer"/>
        <div className="segmented">
          {metrics.map((mm,i)=>(
            <button key={mm.label} className={mi===i?"on":""} onClick={()=>setMi(i)}>{mm.label}</button>
          ))}
        </div>
      </div>
      <div className="util-rows">
        {sorted.map((r,i)=>(
          <div className="util-row" key={i} style={{gridTemplateColumns:`${labelCol}px 1fr 96px`}}>
            <div className={monoLabel?"util-tail":""} style={monoLabel?undefined:{fontSize:12.5, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{r.label}</div>
            <div className="util-bar"><div className="seg" style={{left:0, width:`${(val(r)/max)*100}%`, background:m.color}}/></div>
            <div className="util-value">{fmtV(r)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportsView(){
  const [period, setPeriod] = React.useState("year");
  const isYear = period==="year";
  const periodLabel = isYear ? "anno in corso" : "questo mese";

  const months = ["Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic","Gen","Feb","Mar","Apr"];
  const chartN = isYear ? 12 : 6;
  const cMonths = months.slice(-chartN);
  const chartSub = isYear ? "ultimi 12 mesi" : "ultimi 6 mesi";

  const kpis = isYear ? [
    { label:"Ricavi (anno)",     value:"€548k" },
    { label:"Ore volate (anno)", value:"2.418", unit:"h" },
    { label:"Movimenti (anno)",  value:"1.126" },
    { label:"Quota transiti",    value:"18%" },
    { label:"Utilizzo flotta",   value:"68%" },
  ] : [
    { label:"Ricavi (mese)",     value:"€148,2k" },
    { label:"Ore volate (mese)", value:"648", unit:"h" },
    { label:"Movimenti (mese)",  value:"138" },
    { label:"Quota transiti",    value:"16%" },
    { label:"Utilizzo flotta",   value:"71%" },
  ];

  const fleetUtil = AIRCRAFT_STATS.map(a => ({ tail:a.label, hours: isYear ? a.hoursY : a.hours }));
  const utilMax = Math.max(...fleetUtil.map(u=>u.hours));
  const instrMax = Math.max(...INSTRUCTORS.map(x=> isYear ? x.hoursYtd : x.hoursMtd));

  const movementMix = [
    { k:"Dep/arr basati",     v:64, c:"var(--info)"},
    { k:"Arrivi in transito", v:22, c:"var(--accent)"},
    { k:"Circuiti scuola",    v:11, c:"var(--ok)"},
    { k:"Noleggi",            v:3,  c:"var(--ink-3)"},
  ];

  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <h1>Statistiche</h1>
          <div className="sub">Analisi dell'aeroporto · {periodLabel}</div>
        </div>
        <div style={{display:"flex", gap:8}}>
          <div className="segmented" title="Periodo">
            <button className={period==="month"?"on":""} onClick={()=>setPeriod("month")}>Apr 2026</button>
            <button className={period==="year"?"on":""} onClick={()=>setPeriod("year")}>Anno 2026</button>
          </div>
          <ExportMenu filename="statistiche"/>
          <button className="btn primary">Condividi report</button>
        </div>
      </div>

      <div className="kpi-row">
        {kpis.map((k,i)=>(<KPI key={i} label={k.label} value={k.value} unit={k.unit} delta={k.delta} trend={k.trend}/>))}
      </div>

      <div className="split">
        <div className="card">
          <div className="card-head"><div className="card-title">Ricavi</div><span className="card-sub">{chartSub} · €k</span></div>
          <div className="card-body"><LineChart data={REVENUE.slice(-chartN)} labels={cMonths} color="oklch(0.55 0.14 155)"/></div>
        </div>
        <div className="card">
          <div className="card-head"><div className="card-title">Ore volate</div><span className="card-sub">{chartSub} · h</span></div>
          <div className="card-body"><BarChart data={HOURS_FLOWN.slice(-chartN)} labels={cMonths} color="var(--ink)"/></div>
        </div>
      </div>

      <div className="split">
        <div className="card">
          <div className="card-head"><div className="card-title">Movimenti in transito</div><span className="card-sub">{chartSub}</span></div>
          <div className="card-body"><BarChart data={VISITING_MOVEMENTS.slice(-chartN)} labels={cMonths} color="oklch(0.6 0.14 260)"/></div>
        </div>
        <div className="card">
          <div className="card-head"><div className="card-title">Utilizzo flotta</div><span className="card-sub">ore · {periodLabel}</span></div>
          <div className="util-rows">
            {fleetUtil.map(u => (
              <div className="util-row" key={u.tail} style={{gridTemplateColumns:"90px 1fr 80px"}}>
                <div className="util-tail mono">{u.tail}</div>
                <div className="util-bar"><div className="seg flown" style={{left:0, width:`${(u.hours/utilMax)*100}%`}}/></div>
                <div className="util-value mono">{u.hours.toFixed(1)}h</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="split">
        <div className="card">
          <div className="card-head"><div className="card-title">Composizione movimenti</div><span className="card-sub">per tipo · {periodLabel}</span></div>
          <div className="card-body" style={{display:"flex", flexDirection:"column", gap:10}}>
            <div style={{height:18, borderRadius:4, overflow:"hidden", display:"flex", border:"1px solid var(--border)"}}>
              {movementMix.map((r,i)=>(<div key={i} style={{width:`${r.v}%`, background:r.c}} title={`${r.k} ${r.v}%`}/>))}
            </div>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:12.5}}>
              {movementMix.map((r,i)=>(
                <div key={i} style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                  <span style={{display:"flex", alignItems:"center", gap:8}}>
                    <span style={{width:10, height:10, borderRadius:2, background:r.c, display:"inline-block"}}/>
                    {r.k}
                  </span>
                  <span className="mono num" style={{color:"var(--ink-2)"}}>{r.v}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div className="card-title">Ore istruttori</div><span className="card-sub">{periodLabel}</span></div>
          <div className="util-rows">
            {INSTRUCTORS.map(i => {
              const h = isYear ? i.hoursYtd : i.hoursMtd;
              const owed = isYear ? i.owedYtd : i.owedMtd;
              return (
                <div className="util-row" key={i.id} style={{gridTemplateColumns:"160px 1fr 100px"}}>
                  <div style={{fontSize:12.5, fontWeight:500}}>{i.name}</div>
                  <div className="util-bar"><div className="seg flown" style={{left:0, width:`${(h/instrMax)*100}%`}}/></div>
                  <div className="util-value mono">{h.toFixed(1)}h · €{owed.toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="split">
        <RankBars title="Per aeromobile" sub={`ore e ricavo · ${periodLabel}`} rows={AIRCRAFT_STATS} monoLabel labelCol={80} period={period} metrics={[{label:"Ore",mField:"hours",yField:"hoursY",color:"var(--ok)"},{label:"Ricavo",mField:"revenue",yField:"revenueY",money:true,color:"var(--accent)"}]}/>
        <RankBars title="Per pilota" sub={`top 10 · ${periodLabel}`} rows={PILOT_STATS} labelCol={140} period={period} metrics={[{label:"Ore",mField:"hours",yField:"hoursY",color:"var(--ok)"},{label:"Spesa",mField:"revenue",yField:"revenueY",money:true,color:"var(--accent)"},{label:"Margine",mField:"margin",yField:"marginY",money:true,color:"var(--info)"}]}/>
      </div>
    </>
  );
}

window.ReportsView = ReportsView;
