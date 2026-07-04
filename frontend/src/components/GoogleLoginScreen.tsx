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
          <p>Usa a tua conta Google para carregar o calendário e entrar no dashboard.</p>
        </div>

        {error ? <p className="google-login-error" role="alert">{error}</p> : null}

        <button type="button" className="button primary" onClick={onConnect} disabled={loading || status.connected}>
          {loading ? 'A verificar...' : 'Continuar com Google'}
        </button>
      </section>
    </main>
  );
}
