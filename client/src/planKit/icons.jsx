// Ícones do selo de plano (traços do pacote lucide, licença ISC), para o Harbor não precisar de mais uma dependência.
// Mesmos nomes e a mesma propriedade `size` do lucide-react, para os arquivos do kit ficarem iguais aos do Rex.
const base = (size, extra) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", focusable: "false", ...extra });
const make = (children) => function Icon({ size = 16, ...rest }) { return <svg {...base(size, rest)}>{children}</svg>; };

export const Lock = make(<><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>);
export const Check = make(<path d="M20 6 9 17l-5-5" />);
export const X = make(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);
export const Eye = make(<><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></>);
export const ChevronDown = make(<path d="m6 9 6 6 6-6" />);
export const ChevronUp = make(<path d="m18 15-6-6-6 6" />);
