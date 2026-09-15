import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function Layout({ title, count, actions, children }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-full pt-14 md:pt-0">
        <Topbar title={title} count={count} actions={actions} />
        <main className="flex-1 min-h-0 overflow-y-auto px-4 py-5 md:px-7 md:py-6">{children}</main>
      </div>
    </div>
  );
}
