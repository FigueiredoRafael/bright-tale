import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { SectionEditPanel } from '../SectionEditPanel';

describe('SectionEditPanel', () => {
  it('renders idle by default and switches to form on edit click', async () => {
    render(
      React.createElement(SectionEditPanel, {
        title: 'Test',
        icon: React.createElement('span', { 'data-testid': 'icon' }),
        renderIdle: () => React.createElement('p', {}, 'Idle content'),
        renderForm: ({ onCancel }) => (
          React.createElement('div', {},
            React.createElement('span', {}, 'Form content'),
            React.createElement('button', { onClick: onCancel }, 'Cancel'),
          )
        ),
      }),
    );
    expect(screen.getByText('Idle content')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Edit Test'));
    expect(screen.getByText('Form content')).toBeDefined();
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.getByText('Idle content')).toBeDefined());
  });

  it('switches back to idle after successful save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      React.createElement(SectionEditPanel, {
        title: 'Test',
        icon: React.createElement('span'),
        renderIdle: () => React.createElement('p', {}, 'Idle'),
        renderForm: ({ onSave: save }) => (
          React.createElement('button', { onClick: () => save({ any: 'payload' }) }, 'Save')
        ),
        onSave,
      }),
    );
    fireEvent.click(screen.getByLabelText('Edit Test'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ any: 'payload' }));
    await waitFor(() => expect(screen.getByText('Idle')).toBeDefined());
  });
});
