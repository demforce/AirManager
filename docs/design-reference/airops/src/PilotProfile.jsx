// PilotProfile — slide-over showing full pilot stats, recent flights, license/medical info

function PilotProfile({ pilot, onClose, onEdit }) {
  if (!pilot) return null;

  const ROLE_IT = { Student:"Studente", Member:"Socio", Renter:"Noleggiatore", Instructor:"Istruttore", Visitor:"Visitatore" };
  const STATUS_IT = { active:"attivo", suspended:"sospeso", inactive:"inattivo" };

  const fmtDate = (s) => {
    if (!s || s === "—") return "—";
    const [y, m, d] = s.split("-");
    const M = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"][+m-1];
    return `${+d} ${M} ${y}`;
  };

  const daysUntil = (s) => {
    if (!s || s === "—") return null;
    const diff = new Date(s) - NOW_REF;
    return Math.round(diff / 86400000);
  };

  const expiryTone = (s) => {
    const d = daysUntil(s);
    if (d === null) return "";
    if (d < 0) return "bad";
    if (d < 60) return "warn";
    return "ok";
  };

  const expiryLabel = (s) => {
    const d = daysUntil(s);
    if (d === null) return "—";
    if (d < 0) return `Scaduto da ${Math.abs(d)}g`;
    if (d === 0) return "Scade oggi";
    if (d < 60) return `Tra ${d}g`;
    return fmtDate(s);
  };

  const roleTone = (r) => r === "Student" ? "info" : r === "Member" ? "ok" : r === "Renter" ? "warn" : "";
  const statusTone = (s) => s === "active" ? "ok" : s === "suspended" ? "bad" : "";

  // Pull recent logbook entries for this pilot (match on first initial + last name)
  const nameParts = pilot.name.split(" ");
  const initial = nameParts[0][0];
  const lastName = nameParts[nameParts.length - 1];
  const shortName = `${initial}. ${lastName}`;
  const recentFlights = LOGBOOK.filter(l => l.pilot === shortName).slice(0, 5);

  // Stats derived from logbook
  const totalHours = recentFlights.reduce((a, f) => a + f.dur, 0);
  const totalTakeoffs = recentFlights.reduce((a, f) => a + f.takeoffs, 0);
  const totalLandings = recentFlights.reduce((a, f) => a + f.landings, 0);
  const totalCost = recentFlights.reduce((a, f) => a + f.cost, 0);

  // Avatar initials
  const initials = pilot.name.split(" ").map(n => n[0]).slice(0, 2).join("");

  // Avatar color based on id
  const avatarColors = [
    "oklch(0.65 0.14 245)", "oklch(0.62 0.14 155)", "oklch(0.72 0.14 75)",
    "oklch(0.60 0.18 25)",  "oklch(0.62 0.14 300)", "oklch(0.65 0.12 200)",
    "oklch(0.68 0.13 130)", "oklch(0.60 0.15 350)"
  ];
  const avatarColor = avatarColors[(pilot.id - 1) % avatarColors.length];

  return (
    <SlideOver open={!!pilot} onClose={onClose}
      title={pilot.name}
      subtitle={`${pilot.license}${pilot.licenseNo !== "-" ? " · " + pilot.licenseNo : ""} · ${ROLE_IT[pilot.role]||pilot.role}`}
      footer={<>
        <button className="btn" onClick={onClose}>Chiudi</button>
        <div style={{ flex: 1 }}/>
        <button className="btn primary" onClick={() => { onClose(); onEdit(pilot); }}>Modifica pilota</button>
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
        }}>{initials}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em" }}>{pilot.name}</div>
          <div style={{ color: "var(--ink-2)", fontSize: 12, marginTop: 2 }}>{pilot.email}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <Badge tone={roleTone(pilot.role)}>{ROLE_IT[pilot.role]||pilot.role}</Badge>
            <Badge tone={statusTone(pilot.accountStatus)} dot>{STATUS_IT[pilot.accountStatus]||pilot.accountStatus}</Badge>
            <Badge tone={pilot.current ? "ok" : "bad"} dot>{pilot.current ? "corrente" : "non corrente"}</Badge>
          </div>
        </div>
      </div>

      {/* Quick KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Saldo", value: `€${pilot.balance}`, tone: pilot.balance < 0 ? "bad" : "" },
          { label: "Ultimo volo", value: fmtDate(pilot.lastFlight), tone: "" },
          { label: "Voli recenti", value: recentFlights.length || "—", tone: "" },
        ].map(k => (
          <div key={k.label} style={{
            background: "var(--panel)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", padding: "12px 14px"
          }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase",
              letterSpacing: "0.06em", marginBottom: 4 }}>{k.label}</div>
            <div className="mono num" style={{
              fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em",
              color: k.tone === "bad" ? "var(--bad)" : "var(--ink)"
            }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* License & Medical */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase",
          letterSpacing: "0.07em", color: "var(--ink-3)", marginBottom: 10 }}>Certificazioni</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>

          {/* License */}
          <div style={{ background: "var(--panel)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 6 }}>Licenza</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{pilot.license}</div>
            {pilot.licenseNo !== "-" && (
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 2 }}>{pilot.licenseNo}</div>
            )}
            {pilot.licenseExp && pilot.licenseExp !== "—" && (
              <div style={{ marginTop: 8 }}>
                <Badge tone={expiryTone(pilot.licenseExp)}>{expiryLabel(pilot.licenseExp)}</Badge>
              </div>
            )}
          </div>

          {/* Medical */}
          <div style={{ background: "var(--panel)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 6 }}>Medico</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{pilot.medical}</div>
            <div style={{ marginTop: 8 }}>
              <Badge tone={expiryTone(pilot.medicalExp)}>{expiryLabel(pilot.medicalExp)}</Badge>
            </div>
          </div>

          {/* Ratings */}
          {pilot.ratings && pilot.ratings !== "-" && (
            <div style={{ background: "var(--panel)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", padding: "12px 14px", gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 6 }}>Abilitazioni ed endorsement</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {pilot.ratings.split(" · ").map(r => (
                  <Badge key={r} tone="info">{r}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent activity from logbook */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase",
          letterSpacing: "0.07em", color: "var(--ink-3)", marginBottom: 10 }}>
          Voli recenti
          {recentFlights.length > 0 && (
            <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0,
              color: "var(--ink-4)", marginLeft: 8, fontSize: 11 }}>
              {totalHours.toFixed(1)} h · {totalTakeoffs} dec · {totalLandings} att · €{totalCost.toLocaleString()}
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
                display: "grid", gridTemplateColumns: "80px 64px 1fr auto",
                gap: 12, alignItems: "center",
                padding: "10px 14px",
                background: i % 2 === 0 ? "var(--panel)" : "var(--panel-2)",
                fontSize: 12
              }}>
                <div className="mono" style={{ color: "var(--ink-2)", fontSize: 11 }}>{f.date}</div>
                <div className="mono" style={{ fontWeight: 600 }}>{f.tail}</div>
                <div>
                  <span style={{ color: "var(--ink)" }}>{f.dep} → {f.arr}</span>
                  <span style={{ color: "var(--ink-3)", marginLeft: 6 }}>{f.kind}</span>
                </div>
                <div className="mono num" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{f.dur.toFixed(1)} h</div>
              </div>
            ))}
          </div>
        )}
      </div>

    </SlideOver>
  );
}

Object.assign(window, { PilotProfile });
