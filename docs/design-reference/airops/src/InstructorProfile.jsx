// InstructorProfile — slide-over showing full instructor stats and recent flights as CFI

function InstructorProfile({ instructor, onClose, onEdit }) {
  if (!instructor) return null;

  // Recent logbook entries where this instructor was CFI
  const recentFlights = LOGBOOK.filter(l => l.cfi === instructor.init).slice(0, 6);

  const totalHours = recentFlights.reduce((a, f) => a + f.dur, 0);
  const totalTakeoffs = recentFlights.reduce((a, f) => a + f.takeoffs, 0);
  const totalLandings = recentFlights.reduce((a, f) => a + f.landings, 0);

  // Unique students taught recently
  const recentStudents = [...new Set(recentFlights.map(f => f.pilot))];

  // Avatar color keyed to instructor color token
  const colorMap = {
    amber:  "oklch(0.72 0.14 75)",
    violet: "oklch(0.62 0.14 300)",
    green:  "oklch(0.62 0.14 155)",
    red:    "oklch(0.60 0.18 25)",
    "":     "oklch(0.65 0.14 245)",
  };
  const avatarColor = colorMap[instructor.color] || colorMap[""];

  return (
    <SlideOver open={!!instructor} onClose={onClose}
      title={instructor.name}
      subtitle={instructor.ratings}
      footer={<>
        <button className="btn" onClick={onClose}>Chiudi</button>
        <div style={{ flex: 1 }}/>
        <button className="btn primary" onClick={() => { onClose(); onEdit(instructor); }}>Modifica istruttore</button>
      </>}>

      {/* Avatar + identity */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24,
        padding: "16px 20px", background: "var(--bg-sunken)", borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)" }}>
        <div style={{
          width: 52, height: 52, borderRadius: "50%",
          background: avatarColor,
          color: "#fff", display: "grid", placeItems: "center",
          fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", flexShrink: 0
        }}>{instructor.init}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em" }}>{instructor.name}</div>
          <div style={{ color: "var(--ink-2)", fontSize: 12, marginTop: 2 }}>{instructor.ratings}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {instructor.ratings.split(" · ").map(r => (
              <Badge key={r} tone="info">{r}</Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Quick KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Ore totali",   value: instructor.hoursTotal.toLocaleString() + " h" },
          { label: "Ore nel mese",     value: instructor.hoursMtd.toFixed(1) + " h" },
          { label: "Dovuto totale",    value: "€" + instructor.owedTotal.toLocaleString() },
          { label: "Tariffa oraria",   value: "€" + instructor.rate + " / h" },
        ].map(k => (
          <div key={k.label} style={{
            background: "var(--panel)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", padding: "12px 14px"
          }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase",
              letterSpacing: "0.06em", marginBottom: 4 }}>{k.label}</div>
            <div className="mono num" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Recent students */}
      {recentStudents.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.07em", color: "var(--ink-3)", marginBottom: 10 }}>Allievi recenti</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {recentStudents.map(s => (
              <div key={s} style={{
                padding: "4px 10px", borderRadius: "var(--radius-xs)",
                background: "var(--panel)", border: "1px solid var(--border)",
                fontSize: 12, fontWeight: 500
              }}>{s}</div>
            ))}
          </div>
        </div>
      )}

      {/* Recent flights as CFI */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase",
          letterSpacing: "0.07em", color: "var(--ink-3)", marginBottom: 10 }}>
          Voli recenti come CFI
          {recentFlights.length > 0 && (
            <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0,
              color: "var(--ink-4)", marginLeft: 8, fontSize: 11 }}>
              {totalHours.toFixed(1)} h · {totalTakeoffs} dec · {totalLandings} att
            </span>
          )}
        </div>

        {recentFlights.length === 0 ? (
          <div style={{ color: "var(--ink-3)", fontSize: 13, padding: "16px 0" }}>Nessun volo registrato</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 1,
            border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
            {recentFlights.map((f, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "80px 1fr 64px auto",
                gap: 12, alignItems: "center",
                padding: "10px 14px",
                background: i % 2 === 0 ? "var(--panel)" : "var(--panel-2)",
                fontSize: 12
              }}>
                <div className="mono" style={{ color: "var(--ink-2)", fontSize: 11 }}>{f.date}</div>
                <div>
                  <span style={{ fontWeight: 500 }}>{f.pilot}</span>
                  <span style={{ color: "var(--ink-3)", marginLeft: 6 }}>{f.kind}</span>
                </div>
                <div className="mono" style={{ fontWeight: 600 }}>{f.tail}</div>
                <div className="mono num" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{f.dur.toFixed(1)} h</div>
              </div>
            ))}
          </div>
        )}
      </div>

    </SlideOver>
  );
}

Object.assign(window, { InstructorProfile });
