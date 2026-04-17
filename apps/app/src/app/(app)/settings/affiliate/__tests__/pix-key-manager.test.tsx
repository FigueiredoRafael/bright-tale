import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PixKeyManager } from '../components/pix-key-manager';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/affiliate-api', () => ({
  AffiliateApiError: class extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
  affiliateApi: {
    addPixKey: vi.fn(),
    setDefaultPixKey: vi.fn().mockResolvedValue(undefined),
    deletePixKey: vi.fn().mockResolvedValue(undefined),
  },
}));
import { affiliateApi, AffiliateApiError } from '@/lib/affiliate-api';

const keys = [
  { id: 'k1', keyType: 'cpf', keyDisplay: '***.***.123-45', isDefault: true },
  { id: 'k2', keyType: 'email', keyDisplay: 'p***@x.com', isDefault: false },
] as any;

describe('PixKeyManager', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('lists keys with default badge on the default one', () => {
    render(<PixKeyManager pixKeys={keys} readOnly={false} onChange={vi.fn()} />);
    expect(screen.getByText('***.***.123-45')).toBeInTheDocument();
    expect(screen.getByText(/Padrão/)).toBeInTheDocument();
  });

  it('add happy path calls addPixKey with correct payload and fires onChange', async () => {
    vi.mocked(affiliateApi.addPixKey).mockResolvedValueOnce({} as any);
    const onChange = vi.fn();
    render(<PixKeyManager pixKeys={keys} readOnly={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar chave PIX/ }));
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: 'email' } });
    fireEvent.change(screen.getByLabelText(/Chave/), { target: { value: 'new@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }));
    await waitFor(() =>
      expect(affiliateApi.addPixKey).toHaveBeenCalledWith(
        expect.objectContaining({ keyType: 'email', keyValue: 'new@x.com' }),
      ),
    );
    expect(onChange).toHaveBeenCalled();
  });

  it('invalid CPF blocks submit (no API call)', async () => {
    render(<PixKeyManager pixKeys={keys} readOnly={false} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar chave PIX/ }));
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: 'cpf' } });
    fireEvent.change(screen.getByLabelText(/Chave/), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }));
    await waitFor(() => expect(screen.getByText(/CPF inválido/)).toBeInTheDocument());
    expect(affiliateApi.addPixKey).not.toHaveBeenCalled();
  });

  it('invalid email blocks submit', async () => {
    render(<PixKeyManager pixKeys={keys} readOnly={false} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar chave PIX/ }));
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: 'email' } });
    fireEvent.change(screen.getByLabelText(/Chave/), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }));
    await waitFor(() => expect(screen.getByText(/E-mail inválido/)).toBeInTheDocument());
    expect(affiliateApi.addPixKey).not.toHaveBeenCalled();
  });

  it('409 duplicate surfaces toast with server message', async () => {
    const { toast } = await import('sonner');
    vi.mocked(affiliateApi.addPixKey).mockRejectedValueOnce(new AffiliateApiError(409, 'CONFLICT', 'duplicate key'));
    render(<PixKeyManager pixKeys={keys} readOnly={false} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar chave PIX/ }));
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: 'email' } });
    fireEvent.change(screen.getByLabelText(/Chave/), { target: { value: 'x@y.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('duplicate key'));
  });

  it('setDefault click calls API + onChange', async () => {
    const onChange = vi.fn();
    render(<PixKeyManager pixKeys={keys} readOnly={false} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Definir como padrão/ })[0]);
    await waitFor(() => expect(affiliateApi.setDefaultPixKey).toHaveBeenCalledWith('k2'));
    expect(onChange).toHaveBeenCalled();
  });

  it('delete default key blocked when others exist', () => {
    render(<PixKeyManager pixKeys={keys} readOnly={false} onChange={vi.fn()} />);
    const row = screen.getByText('***.***.123-45').closest('tr')!;
    const removeBtn = row.querySelector('button[data-action="remove"]') as HTMLButtonElement;
    expect(removeBtn.disabled).toBe(true);
  });

  it('delete non-default key opens confirm and calls API on confirm', async () => {
    const onChange = vi.fn();
    render(<PixKeyManager pixKeys={keys} readOnly={false} onChange={onChange} />);
    const row = screen.getByText('p***@x.com').closest('tr')!;
    const removeBtn = row.querySelector('button[data-action="remove"]') as HTMLButtonElement;
    fireEvent.click(removeBtn);
    const confirm = await screen.findByRole('button', { name: /^Confirmar$/ });
    fireEvent.click(confirm);
    await waitFor(() => expect(affiliateApi.deletePixKey).toHaveBeenCalledWith('k2'));
    expect(onChange).toHaveBeenCalled();
  });

  it('empty list shows add CTA only (no table)', () => {
    render(<PixKeyManager pixKeys={[]} readOnly={false} onChange={vi.fn()} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: /Adicionar chave PIX/ })).toBeInTheDocument();
  });
});
