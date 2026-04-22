import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { InlineEditableText } from '../InlineEditableText';

function renderWithMockSave(initial = 'Hello', onSave = vi.fn().mockResolvedValue(undefined)) {
  render(React.createElement(InlineEditableText, { value: initial, onSave, ariaLabel: 'Title' }));
  return { onSave };
}

describe('InlineEditableText', () => {
  it('renders idle value with hover affordance', () => {
    renderWithMockSave();
    expect(screen.getByText('Hello')).toBeDefined();
  });

  it('enters edit mode on click', async () => {
    renderWithMockSave();
    fireEvent.click(screen.getByText('Hello'));
    const input = await screen.findByRole('textbox');
    expect(input).toHaveProperty('value', 'Hello');
  });

  it('saves on Enter and exits edit mode', async () => {
    const { onSave } = renderWithMockSave();
    fireEvent.click(screen.getByText('Hello'));
    const input = await screen.findByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'World' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('World'));
  });

  it('cancels on Escape (no save, restores original)', async () => {
    const { onSave } = renderWithMockSave();
    fireEvent.click(screen.getByText('Hello'));
    const input = await screen.findByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'World' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Hello')).toBeDefined();
  });

  it('rolls back on save failure', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('Bad value'));
    renderWithMockSave('Hello', failing);
    fireEvent.click(screen.getByText('Hello'));
    const input = await screen.findByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'World' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(failing).toHaveBeenCalled());
    expect(screen.getByText('Hello')).toBeDefined();
  });
});
