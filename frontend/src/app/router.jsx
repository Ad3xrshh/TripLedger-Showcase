import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.jsx';
import { AuthLayout } from '../components/layout/AuthLayout.jsx';
import { RequireAuth } from '../components/layout/RequireAuth.jsx';
import { RootRoute } from '../components/layout/RootRoute.jsx';
import { LoginPage } from '../pages/LoginPage.jsx';
import { RegisterPage } from '../pages/RegisterPage.jsx';
import { CreateTripPage } from '../pages/CreateTripPage.jsx';
import { JoinTripPage } from '../pages/JoinTripPage.jsx';
import { TripDetailPage } from '../pages/TripDetailPage.jsx';
import { TripMembersPage } from '../pages/TripMembersPage.jsx';
import { ExpensesPage } from '../pages/ExpensesPage.jsx';
import { CreateExpensePage } from '../pages/CreateExpensePage.jsx';
import { ExpenseDetailPage } from '../pages/ExpenseDetailPage.jsx';
import { NotFoundPage } from '../pages/NotFoundPage.jsx';
import { SystemErrorPage } from '../pages/SystemErrorPage.jsx';

/**
 * Route tree.
 *
 * - /                               -> RootRoute: landing page if logged
 *                                      out, My Trips (AppShell) if
 *                                      logged in - see
 *                                      components/layout/RootRoute.jsx
 * - /login, /register              -> public, AuthLayout (itself
 *                                      redirects to / if already
 *                                      authenticated - see AuthLayout.jsx)
 * - /trips/new, /trips/join         -> create/join a trip
 * - /trips/:tripId                  -> trip detail
 * - /trips/:tripId/members          -> members + settlement units
 * - /trips/:tripId/expenses         -> expense list (9.3)
 * - /trips/:tripId/expenses/new     -> add expense (9.3)
 * - /trips/:tripId/expenses/:expenseId -> expense detail/edit (9.3)
 *
 * Budget dashboard/approval/settlement/closure routes are intentionally
 * not added yet; those land in phases 9.4-9.7.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootRoute />,
    errorElement: <SystemErrorPage />,
  },
  {
    element: <AuthLayout />,
    errorElement: <SystemErrorPage />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <SystemErrorPage />,
    children: [
      { path: '/trips/new', element: <CreateTripPage /> },
      { path: '/trips/join', element: <JoinTripPage /> },
      { path: '/trips/:tripId', element: <TripDetailPage /> },
      { path: '/trips/:tripId/members', element: <TripMembersPage /> },
      { path: '/trips/:tripId/expenses', element: <ExpensesPage /> },
      { path: '/trips/:tripId/expenses/new', element: <CreateExpensePage /> },
      { path: '/trips/:tripId/expenses/:expenseId', element: <ExpenseDetailPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
