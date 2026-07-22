import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import AuthenticatedAppShell from './app/AuthenticatedAppShell';
import { safeInternalReturnTo } from './app/navigation';
import useAppControllers from './app/useAppControllers';
import GoogleLoginScreen from './components/GoogleLoginScreen';
import { AdvisorProvider } from './features/advisor/context/AdvisorContext';
import { GoogleCalendarProvider } from './features/calendar/context/GoogleCalendarContext';
import { loginPath, viewFromPath, viewPath } from './utils/routes';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isLoginRoute = location.pathname.replace(/\/+$/, '') === '/login';
  const routeView = viewFromPath(location.pathname);
  const view = routeView || 'kanban';
  const protectedReturnTo = `${location.pathname}${location.search}${location.hash}`;
  const loginReturnTo = safeInternalReturnTo(new URLSearchParams(location.search).get('returnTo'));
  const controllers = useAppControllers({ view, navigate });
  const { dashboard, googleCalendar, advisorController } = controllers;

  if (!routeView && !isLoginRoute) {
    return <Navigate to="/" replace />;
  }

  if (isLoginRoute && googleCalendar.googleStatus.connected) {
    return <Navigate to={loginReturnTo} replace />;
  }

  if (!isLoginRoute && googleCalendar.googleSessionExpired) {
    return <Navigate to="/login" replace />;
  }

  if (!isLoginRoute && !googleCalendar.googleLoading && !googleCalendar.googleStatus.connected) {
    return <Navigate to={loginPath(protectedReturnTo)} replace />;
  }

  if (isLoginRoute || !googleCalendar.googleStatus.connected) {
    return (
      <div className="app-shell">
        <GoogleLoginScreen
          status={googleCalendar.googleStatus}
          loading={googleCalendar.googleLoading}
          error={dashboard.error}
          onConnect={() => googleCalendar.connectGoogle(loginReturnTo)}
        />
      </div>
    );
  }

  return (
    <GoogleCalendarProvider value={googleCalendar}>
      <AdvisorProvider value={advisorController}>
        <AuthenticatedAppShell
          view={view}
          controllers={controllers}
          onOpenSettings={() => navigate(viewPath('settings'))}
        />
      </AdvisorProvider>
    </GoogleCalendarProvider>
  );
}

