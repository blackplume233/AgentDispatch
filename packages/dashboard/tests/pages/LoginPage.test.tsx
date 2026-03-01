import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../helpers/render';
import { LoginPage } from '@/pages/LoginPage';

const mockLogin = vi.fn();

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    login: mockLogin,
    logout: vi.fn(),
    token: null,
    isAuthenticated: false,
    isLoading: false,
    authEnabled: true,
    username: null,
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    mockLogin.mockReset();
  });

  it('renders login form', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByLabelText('auth.username')).toBeInTheDocument();
    expect(screen.getByLabelText('auth.password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'auth.login' })).toBeInTheDocument();
  });

  it('calls login on form submit', async () => {
    mockLogin.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithProviders(<LoginPage />);
    await user.type(screen.getByLabelText('auth.username'), 'admin');
    await user.type(screen.getByLabelText('auth.password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'auth.login' }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('admin', 'secret');
    });
  });

  it('displays error on login failure', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));
    const user = userEvent.setup();

    renderWithProviders(<LoginPage />);
    await user.type(screen.getByLabelText('auth.username'), 'admin');
    await user.type(screen.getByLabelText('auth.password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'auth.login' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('disables button while loading', async () => {
    mockLogin.mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();

    renderWithProviders(<LoginPage />);
    await user.type(screen.getByLabelText('auth.username'), 'admin');
    await user.type(screen.getByLabelText('auth.password'), 'pass');
    await user.click(screen.getByRole('button', { name: 'auth.login' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'auth.loggingIn' })).toBeDisabled();
    });
  });
});
