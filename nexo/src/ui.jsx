// Componentes base de NEXO. Todos los módulos los reutilizan para que la app se sienta una sola.
import React, { useEffect, useRef, useState } from 'react';
import { Link } from './router.jsx';

export function Page({ title, actions, children, back }) {
  return (
    <section className="page">
      <header className="page-head">
        {back && <Link to={back} className="back" aria-label="Volver">‹</Link>}
        <h2>{title}</h2>
        {actions && <div className="page-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Card({ children, className = '', ...rest }) {
  return <div className={`card ${className}`} {...rest}>{children}</div>;
}

export function Button({ variant = 'primary', small, children, ...rest }) {
  return <button className={`${variant === 'primary' ? '' : variant} ${small ? 'small' : ''}`.trim()} {...rest}>{children}</button>;
}

export function Field({ label, children, hint, error }) {
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && !error && <span className="muted small">{hint}</span>}
      {error && <span className="error small">{error}</span>}
    </label>
  );
}

export function Empty({ icon = '✨', title, hint, action }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>{icon}</div>
      <p><b>{title}</b></p>
      {hint && <p className="muted">{hint}</p>}
      {action}
    </div>
  );
}

export function Badge({ tone = 'muted', children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="seg" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'active' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

// Hoja inferior en iPhone, diálogo centrado en iPad/Mac. Cierra con Esc, clic fuera o botón.
export function Sheet({ open, onClose, title, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector('input, textarea, select, button');
    first?.focus?.();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header className="sheet-head"><h3>{title}</h3><button className="icon" onClick={onClose} aria-label="Cerrar">✕</button></header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

// Lista de registros con enlace interno.
export function ListItem({ to, title, meta, right, onClick, className = '', children }) {
  const body = (
    <>
      <div className="grow">
        <div className="li-title">{title}</div>
        {meta && <div className="muted small">{meta}</div>}
        {children}
      </div>
      {right}
    </>
  );
  return to
    ? <li className={`li ${className}`}><Link to={to} className="li-link">{body}</Link></li>
    : <li className={`li ${className}`} onClick={onClick}>{body}</li>;
}

// Aviso breve que desaparece solo (y botón Deshacer opcional).
let toastListeners = [];
export function toast(message, { action, onAction, ms = 5000 } = {}) {
  toastListeners.forEach((fn) => fn({ id: Date.now() + Math.random(), message, action, onAction, ms }));
}
export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const fn = (t) => { setItems((x) => [...x, t]); setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), t.ms); };
    toastListeners.push(fn);
    return () => { toastListeners = toastListeners.filter((f) => f !== fn); };
  }, []);
  if (!items.length) return null;
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.message}</span>
          {t.action && <button className="link" onClick={() => { t.onAction?.(); setItems((x) => x.filter((i) => i.id !== t.id)); }}>{t.action}</button>}
        </div>
      ))}
    </div>
  );
}

export function confirmDialog(message) { return Promise.resolve(window.confirm(message)); }
