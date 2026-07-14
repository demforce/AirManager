// Shared export menu — PDF / Excel dropdown
function ExportMenu({ filename="export" }){
  const [open, setOpen] = React.useState(false);
  const exportCSV = () => {
    // In a real app, generate real CSV. Here just show feedback.
    setOpen(false);
    showToast(`Esportazione CSV di ${filename}.csv avviata`);
  };
  const exportPDF = () => {
    setOpen(false);
    showToast(`Esportazione PDF di ${filename}.pdf avviata`);
  };
  return (
    <div style={{position:"relative"}}>
      <button className="btn" onClick={()=>setOpen(o=>!o)}>
        <Icon.doc/> Esporta <span style={{fontSize:10, marginLeft:2, opacity:0.6}}>▾</span>
      </button>
      {open && (
        <>
          <div className="popover-scrim" onClick={()=>setOpen(false)}/>
          <div className="popover" style={{minWidth:180, right:0, left:"auto"}}>
            <div className="pop-row" style={{gap:4}}>
              <button className="btn" style={{width:"100%", justifyContent:"flex-start", gap:10}} onClick={exportPDF}>
                <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--bad)", fontWeight:600}}>PDF</span>
                Esporta in PDF
              </button>
              <button className="btn" style={{width:"100%", justifyContent:"flex-start", gap:10}} onClick={exportCSV}>
                <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--ok)", fontWeight:600}}>XLS</span>
                Esporta in Excel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

window.ExportMenu = ExportMenu;
