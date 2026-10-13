// src/Tour.jsx — guia "Primeiros passos": caixa de explicação que destaca cada área do menu.
// Próximo / Voltar / Pular; abre sozinho no primeiro acesso e pode ser reaberto pelo menu a qualquer hora.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../auth/i18n.js";

const W = 340;
// One entry per step; "target" is a data-tour attribute in the menu (a step whose target is not on screen is skipped).
export const TOUR_STEPS = [
  { id: 'welcome', target: null, title: 'Welcome to Roster', body: 'A one-minute tour of the main areas. You can open it again at any time from Getting started in the menu.' },
  { id: 'clients', target: 'nav-clients', title: 'Clients', body: 'Start here: add the companies that hire you. Each client can have many jobs.' },
  { id: 'jobs', target: 'nav-jobs', title: 'Jobs', body: 'Create a job for every opening. Open jobs count toward your plan limit.' },
  { id: 'candidates', target: 'nav-candidates', title: 'Candidates', body: 'Add people by hand, paste a resume to fill the form for you, or import from a photo.' },
  { id: 'pipeline', target: 'nav-pipeline', title: 'Pipeline', body: 'Move each candidate through the stages: screened, submitted to the client, interview, offer and placed.' },
  { id: 'placements', target: 'nav-placements', title: 'Placements', body: 'When someone starts, record the pay rate, the bill rate and your fee. Timesheets and invoices follow from here.' },
  { id: 'automations', target: 'nav-automations', title: 'Automations', body: 'Rules that run for you: alerts for submitted candidates, jobs open too long, interview follow-ups and late timesheets.' },
  { id: 'tour', target: 'nav-tour', title: 'Getting started', body: 'Open this guide again here. Your plan, agency profile and logins are in Settings.' },
];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const find = (target) => (target ? document.querySelector(`[data-tour="${target}"]`) : null);
const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

export default function Tour({ open, onClose, accent = "#5B4EE0", light = true, ensureNav }) {
  const { t } = useT();
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const dir = useRef(1);
  const boxRef = useRef(null);
  const nextRef = useRef(null);
  const [boxH, setBoxH] = useState(220);

  // abrir sempre no passo 1
  useEffect(() => { if (open) { setIdx(0); dir.current = 1; } }, [open]);

  // medir o alvo (e pular o passo se o alvo não existir, p.ex. tela escondida por permissão)
  useLayoutEffect(() => {
    if (!open) return undefined;
    const step = TOUR_STEPS[idx];
    if (!step) return undefined;
    if (!step.target) { setRect(null); return undefined; }
    ensureNav?.();
    let tries = 0, timer;
    const measure = () => {
      const el = find(step.target);
      if (!visible(el)) {
        if (++tries > 8) { // sem alvo visível: vai para o próximo passo na direção atual
          const n = idx + dir.current;
          if (n < 0 || n >= TOUR_STEPS.length) onClose?.(); else setIdx(n);
          return;
        }
        timer = setTimeout(measure, 60);
        return;
      }
      el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    measure();
    // o menu-gaveta do celular desliza para dentro (~0,22 s): mede de novo quando ele terminar de abrir
    const again = [140, 360].map((ms) => setTimeout(() => {
      const el = find(step.target);
      if (!visible(el)) return;
      const r = el.getBoundingClientRect();
      setRect((o) => (o && Math.abs(o.left - r.left) < 0.5 && Math.abs(o.top - r.top) < 0.5 ? o : { left: r.left, top: r.top, width: r.width, height: r.height }));
    }, ms));
    return () => { clearTimeout(timer); again.forEach(clearTimeout); };
  }, [open, idx, vp.w, vp.h]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  useEffect(() => { if (open) nextRef.current?.focus?.(); }, [open, idx]);
  useLayoutEffect(() => { if (open && boxRef.current) setBoxH(boxRef.current.offsetHeight); }, [open, idx, vp.w]);

  const last = idx === TOUR_STEPS.length - 1;
  const go = (d) => { dir.current = d; const n = idx + d; if (n < 0) return; if (n >= TOUR_STEPS.length) onClose?.(); else setIdx(n); };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose?.(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, idx]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const step = TOUR_STEPS[idx];
  if (!step) return null;
  const txt = { title: t(step.title), body: t(step.body) };
  const mobile = vp.w < 640;

  // posição da caixa
  let box;
  if (mobile || !rect) {
    box = mobile
      ? { left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }
      : { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: Math.min(W + 40, vp.w - 24) };
  } else if (rect.left + rect.width + 16 + W + 12 <= vp.w) {
    box = { left: rect.left + rect.width + 16, top: clamp(rect.top + rect.height / 2 - boxH / 2, 12, Math.max(12, vp.h - boxH - 12)), width: W };
  } else {
    box = { left: clamp(rect.left, 12, vp.w - W - 12), top: clamp(rect.top + rect.height + 12, 12, Math.max(12, vp.h - boxH - 12)), width: W };
  }
  const bg = light ? "#ffffff" : "#241636";
  const fg = light ? "#1a1326" : "#ffffff";
  const sub = light ? "rgba(26,19,38,0.72)" : "rgba(255,255,255,0.75)";
  const line = light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.14)";
  const pad = 5;

  return (
    <div data-testid="tour" style={{ position: "fixed", inset: 0, zIndex: 9999 }} role="presentation">
      {/* bloqueia cliques no fundo e escurece (com um "furo" no alvo) */}
      <div style={{ position: "absolute", inset: 0, background: rect ? "transparent" : "rgba(0,0,0,0.62)" }} onClick={(e) => e.stopPropagation()} />
      {rect && (
        <div
          data-testid="tour-spot"
          style={{ position: "fixed", left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, borderRadius: 10, boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)", outline: `2px solid ${accent}`, pointerEvents: "none", transition: "all .18s ease" }}
        />
      )}
      <div
        ref={boxRef}
        role="dialog" aria-modal="true" aria-labelledby="roster-tour-title"
        data-testid="tour-box"
        style={{ position: "fixed", ...box, background: bg, color: fg, border: `1px solid ${line}`, borderRadius: 14, padding: 18, boxShadow: "0 18px 50px rgba(0,0,0,0.45)", maxWidth: "calc(100vw - 24px)" }}
      >
        <button type="button" onClick={onClose} aria-label={t("Close")} data-testid="tour-x" style={{ position: "absolute", top: 8, right: 8, color: sub, padding: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: accent, fontWeight: 700 }} data-testid="tour-count">
          {t("Step {n} of {total}", { n: idx + 1, total: TOUR_STEPS.length })}
        </div>
        <h3 id="roster-tour-title" style={{ fontSize: 17, fontWeight: 700, margin: "6px 0 6px", paddingRight: 22 }} data-testid="tour-title">{txt.title}</h3>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: sub, margin: 0 }} data-testid="tour-body">{txt.body}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button type="button" onClick={onClose} data-testid="tour-skip" style={{ fontSize: 12.5, color: sub, textDecoration: "underline", padding: "6px 4px" }}>{t("Skip guide")}</button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {idx > 0 && (
              <button type="button" onClick={() => go(-1)} data-testid="tour-back" style={{ fontSize: 13, padding: "8px 14px", borderRadius: 10, border: `1px solid ${line}`, color: fg }}>{t("Back")}</button>
            )}
            <button type="button" ref={nextRef} onClick={() => go(1)} data-testid="tour-next" style={{ fontSize: 13, fontWeight: 700, padding: "8px 16px", borderRadius: 10, background: accent, color: "#1a1326" }}>{last ? t("Done") : t("Next")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
