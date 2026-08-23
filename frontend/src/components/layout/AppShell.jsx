import { Outlet } from 'react-router-dom';
import { Topbar } from './Topbar.jsx';
import { Sidebar } from './Sidebar.jsx';
import { TicketDivider } from '../ui/TicketDivider.jsx';
import './AppShell.css';

/**
 * The professional app shell used for every authenticated page:
 * topbar, primary nav, and a content area. Normally reached as a layout
 * route, so `children` is undefined and `Outlet` renders whichever
 * nested route matched (every route under RequireAuth in
 * app/router.jsx). `children` is only ever passed explicitly by
 * RootRoute.jsx, which needs this exact shell for My Trips at `/`
 * without going through nested routing (that path has to conditionally
 * be the shell+My Trips or the public landing page, at the same URL).
 */
export function AppShell({ children }) {
  return (
    <div className="app-shell">
      <Topbar />
      <TicketDivider />
      <div className="app-shell__body">
        <Sidebar />
        <main className="app-shell__content">{children ?? <Outlet />}</main>
      </div>
    </div>
  );
}
