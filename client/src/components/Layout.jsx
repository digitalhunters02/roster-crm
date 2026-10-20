import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import { usePlan } from '../plans/PlanContext.jsx';
import { PlanPreviewBar } from '../planKit/PlanPreview.jsx';
import { useT } from '../auth/i18n.js';

export default function Layout({ title, count, actions, children }) {
  const { billing } = usePlan();
  const { lang } = useT();
  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-full pt-14 md:pt-0">
        {/* Faixa fixa enquanto o dono da plataforma está vendo o Roster como outro plano ("Ver como plano"). */}
        {billing?.owner && billing.previewPlan && <div className="roster-previewbar flex-shrink-0"><PlanPreviewBar me={billing} langKey={lang} /></div>}
        <Topbar title={title} count={count} actions={actions} />
        <main className="flex-1 min-h-0 overflow-y-auto px-4 py-5 md:px-7 md:py-6">{children}</main>
      </div>
    </div>
  );
}
