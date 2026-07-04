import type { GoogleStatus } from '../../../shared/types';

type GoogleLoginScreenProps = {
  status: GoogleStatus;
  loading: boolean;
  error?: string;
  onConnect: () => void;
};

export default function GoogleLoginScreen({ status, loading, error, onConnect }: GoogleLoginScreenProps) {
  return (
    <main className="google-login-screen" aria-label="Google login">
      <section className="google-login-panel">
        <div>
          <span>Task Organizer</span>
          <h1>Ligar Google</h1>
          <p>Usa a tua conta Google para carregar o calendario e entrar no dashboard.</p>
        </div>
        {error && <p className="google-login-error">{error}</p>}
        {status.requiresReconnect && <p className="google-login-error">A sessao Google expirou. Liga novamente.</p>}
        <button type="button" className="button primary" onClick={onConnect} disabled={loading}>
          {loading ? 'A verificar...' : 'Continuar com Google'}
        </button>
      </section>
    </main>
  );
}
