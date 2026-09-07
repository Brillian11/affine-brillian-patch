import { Button, Input, notify } from '@affine/component';
import { useEffect, useState } from 'react';

import { TodoistService } from './todoist-service';

export const TodoistConfigManager = () => {
  const [token, setToken] = useState(TodoistService.getToken());
  const [tokenInput, setTokenInput] = useState('');
  const [isEditing, setIsEditing] = useState(!TodoistService.getToken());
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'error'>(
    TodoistService.getToken() ? 'connected' : 'disconnected'
  );

  useEffect(() => {
    const handleUpdate = () => {
      const current = TodoistService.getToken();
      setToken(current);
      setConnectionStatus(current ? 'connected' : 'disconnected');
      setIsEditing(!current);
    };
    window.addEventListener('affine:todoist-token-updated', handleUpdate);
    return () => window.removeEventListener('affine:todoist-token-updated', handleUpdate);
  }, []);

  const handleSaveToken = async () => {
    const clean = tokenInput.trim();
    if (!clean) return;

    setTesting(true);
    const testResult = await TodoistService.testConnection(clean);
    setTesting(false);

    if (testResult.success) {
      TodoistService.setToken(clean);
      setToken(clean);
      setTokenInput('');
      setIsEditing(false);
      setConnectionStatus('connected');
      notify.success({ title: 'Connected to Todoist', message: 'API Token verified successfully.' });
    } else {
      setConnectionStatus('error');
      notify.error({ title: 'Todoist Connection Failed', message: testResult.error || 'Invalid API Token' });
    }
  };

  const handleDisconnect = () => {
    TodoistService.setToken('');
    setToken('');
    setTokenInput('');
    setIsEditing(true);
    setConnectionStatus('disconnected');
    notify({ title: 'Todoist Disconnected', message: 'API Token removed.' });
  };

  const maskedToken = token.length <= 8 ? '••••••••' : `${token.slice(0, 4)}••••••••••••••••${token.slice(-4)}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', marginTop: '8px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: 'var(--affine-background-secondary-color, #f8fafc)',
          borderRadius: '8px',
          border: '1px solid var(--affine-border-color, #e2e8f0)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background:
                connectionStatus === 'connected'
                  ? '#10b981'
                  : connectionStatus === 'error'
                    ? '#ef4444'
                    : '#94a3b8',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>
              {connectionStatus === 'connected'
                ? 'Todoist Account Connected'
                : connectionStatus === 'error'
                  ? 'Connection Error'
                  : 'Todoist API Token Required'}
            </span>
            {token && !isEditing && (
              <span style={{ fontSize: '12px', color: 'var(--affine-text-secondary-color, #64748b)', marginTop: '2px' }}>
                Active Token: <code style={{ background: 'var(--affine-background-primary-color, #ffffff)', padding: '1px 4px', borderRadius: '4px' }}>{maskedToken}</code>
              </span>
            )}
          </div>
        </div>

        {token && !isEditing && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setIsEditing(true)} size="small">
              Change Token
            </Button>
            <Button onClick={handleDisconnect} size="small" variant="error">
              Disconnect
            </Button>
          </div>
        )}
      </div>

      {isEditing && (
        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
          <Input
            type="password"
            value={tokenInput}
            onChange={setTokenInput}
            placeholder="Paste your Todoist API Token (from todoist.com/app/settings/integrations/developer)..."
            style={{ flex: 1 }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveToken().catch(console.error);
              }
            }}
          />
          <Button
            onClick={() => {
              handleSaveToken().catch(console.error);
            }}
            type="primary"
            loading={testing}
          >
            Save & Connect
          </Button>
          {token && (
            <Button onClick={() => setIsEditing(false)} variant="plain">
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
