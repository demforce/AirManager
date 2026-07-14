// Reusable right-side slide-over

function SlideOver({ title, subtitle, open, onClose, children, footer }){
  React.useEffect(()=>{
    const h = (e)=> e.key==="Escape" && onClose?.();
    window.addEventListener("keydown", h);
    return ()=> window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className={`slideover ${open?"open":""}`} aria-hidden={!open}>
      <div className="slideover-scrim" onClick={onClose}/>
      <aside className="slideover-panel">
        <header className="so-head">
          <div>
            <div className="so-sub">{subtitle}</div>
            <div className="so-title">{title}</div>
          </div>
          <button className="iconbtn" onClick={onClose} title="Chiudi (Esc)">✕</button>
        </header>
        <div className="so-body">{children}</div>
        {footer && <footer className="so-foot">{footer}</footer>}
      </aside>
    </div>
  );
}

function Field({ label, children, wide=false }){
  return (
    <label className={`fld ${wide?"wide":""}`}>
      <span className="fld-label">{label}</span>
      <span className="fld-ctrl">{children}</span>
    </label>
  );
}

function Input(props){ return <input className="input" {...props}/>; }
function Select({children, ...props}){ return <select className="input" {...props}>{children}</select>; }

Object.assign(window, { SlideOver, Field, Input, Select });
