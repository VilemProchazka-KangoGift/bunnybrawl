import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharacterDropdown } from './CharacterDropdown';
describe('illustrated online character dropdown', () => {
  it('prevents taken choices and selects an available character', () => {
    const onChange = vi.fn();
    render(<CharacterDropdown value="Bunny" onChange={onChange} characters={[{name:'Bunny'},{name:'Fox'},{name:'Panda'}]} taken={new Set(['Fox'])} />);
    fireEvent.click(screen.getByRole('button', {name:'Your character'}));
    expect(screen.getByRole('button', {name:/Fox/})).toBeDisabled();
    fireEvent.click(screen.getByRole('button', {name:'Panda'}));
    expect(onChange).toHaveBeenCalledWith('Panda');
    expect(screen.getByRole('button', {name:'Your character'})).toHaveAttribute('aria-expanded','false');
    expect(screen.getByRole('button', {name:'Your character'})).toHaveFocus();
  });
  it('locks selection when ready and closes on Escape', () => {
    const { rerender } = render(<CharacterDropdown value="Bunny" onChange={vi.fn()} characters={[{name:'Bunny'}]} taken={new Set()} disabled />);
    expect(screen.getByRole('button')).toBeDisabled();
    rerender(<CharacterDropdown value="Bunny" onChange={vi.fn()} characters={[{name:'Bunny'}]} taken={new Set()} />);
    fireEvent.click(screen.getByRole('button')); fireEvent.keyDown(screen.getByRole('button', {name:'Bunny'}), {key:'Escape'});
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded','false');
  });
});
