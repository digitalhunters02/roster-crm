// "Simple resume reading": pulls the obvious fields out of resume text (no AI, no cost, works offline) so the
// recruiter only reviews them. Emails, phones, a name from the first line, a title line, years and a skills list.
// The AI-powered reading of PDFs and photos is the separate "Import from photo" tool.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const SKILL_HEADING = /^(?:key\s+|technical\s+|core\s+)?(skills?|habilidades|competencias|competencias técnicas|tecnologias|technologies|expertise)\s*[:\-]?\s*(.*)$/i;
const EXPERIENCE_HEADING = /^(experience|work experience|employment|experiência|experiencia)\b/i;
const TITLE_HINT = /\b(engineer|developer|manager|analyst|assistant|specialist|coordinator|director|nurse|driver|operator|technician|associate|recruiter|accountant|paralegal|administrator|supervisor|welder|electrician|cook|cashier|warehouse|clerk|representative|consultant|designer|teacher|mechanic|laborer|forklift|janitor|housekeeper)\b/i;

export function parseResumeText(text) {
  const raw = String(text || '').replace(/\r/g, '').slice(0, 20000);
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const out = { name: '', email: '', phone: '', current_title: '', current_employer: '', skills: '', resume_summary: '' };
  if (!lines.length) return out;
  out.email = (raw.match(EMAIL) || [''])[0].toLowerCase();
  const ph = raw.match(PHONE);
  if (ph) out.phone = ph[0].trim();

  // Name: first short line that is mostly letters and is not the email/phone/a heading.
  for (const l of lines.slice(0, 6)) {
    if (EMAIL.test(l) || PHONE.test(l) || l.length > 50 || /\d/.test(l)) continue;
    const words = l.split(/\s+/);
    if (words.length >= 2 && words.length <= 5 && /^[\p{L}][\p{L}.'’ -]+$/u.test(l)) { out.name = l.replace(/\s+/g, ' '); break; }
  }
  // Title: a line near the top with a job word (and not the name).
  for (const l of lines.slice(0, 10)) {
    if (l === out.name || EMAIL.test(l) || l.length > 70) continue;
    if (TITLE_HINT.test(l)) { out.current_title = l.replace(/^(objective|summary|profile)\s*[:\-]\s*/i, ''); break; }
  }
  // Employer: "Title at Company" / "Title - Company" right after the Experience heading.
  const exp = lines.findIndex((l) => EXPERIENCE_HEADING.test(l));
  if (exp >= 0) {
    for (const l of lines.slice(exp + 1, exp + 5)) {
      const m = l.match(/^(.+?)\s+(?:at|@|-|–|—|\|)\s+([A-Z][^|,\n]{1,60})/);
      if (m) { if (!out.current_title) out.current_title = m[1].trim(); out.current_employer = m[2].trim().replace(/\s*\(.*$/, ''); break; }
    }
  }
  // Skills: after a "Skills:" heading, comma/bullet separated.
  const si = lines.findIndex((l) => SKILL_HEADING.test(l));
  if (si >= 0) {
    const first = lines[si].match(SKILL_HEADING)[2];
    const chunk = [first, ...lines.slice(si + 1, si + 4).filter((l) => l.length < 160 && !EXPERIENCE_HEADING.test(l) && !/^(education|summary|profile|certif)/i.test(l))].join(', ');
    out.skills = chunk.split(/[,;•·|•]|\s{2,}/).map((x) => x.replace(/^[-*\s]+/, '').trim()).filter((x) => x && x.length <= 40).slice(0, 25).join(', ');
  }
  const summary = lines.filter((l) => l !== out.name && !EMAIL.test(l) && !PHONE.test(l) && l.length > 40).slice(0, 2).join(' ');
  out.resume_summary = summary.slice(0, 400);
  return out;
}
