import React, {useState} from 'react';

export type Session = {
  username: string;
  membershipStatus?: string;
  userId?: string;
  auth?: boolean;
};

type LoginScreenProps = {
  onSuccess: (session: Session) => void;
};

export const LoginScreen: React.FC<LoginScreenProps> = ({onSuccess}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email, password}),
      });
      const payload = await response.json() as Session & {error?: string};
      if (!response.ok || !payload.username) throw new Error(payload.error || 'Не удалось войти.');
      onSuccess({username: payload.username, membershipStatus: payload.membershipStatus});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось войти.');
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="login-screen">
      <form className="login-card" onSubmit={(event) => void submit(event)}>
        <a className="brand-link" href="https://lokvita.org" target="_blank" rel="noopener noreferrer">
          <img className="login-mark" src="/brand/s1-logo.png" alt="" width={72} height={65} />
          <img className="login-wordmark" src="/brand/wordmark-64.png" alt="Lokvita" />
        </a>
        <h1>VChat</h1>
        <p>Студия видео из диалога. Вход для участников Lokvita.</p>
        {error ? <div className="notice error" role="alert">{error}</div> : null}
        <label>
          Email
          <input
            type="email"
            value={email}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" disabled={pending || !email.trim() || !password}>
          {pending ? 'Вход…' : 'Войти'}
        </button>
        <a className="login-link" href="https://lokvita.org/auth/login">Кабинет Lokvita</a>
      </form>
    </section>
  );
};
