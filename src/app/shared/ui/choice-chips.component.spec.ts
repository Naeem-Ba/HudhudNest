import { ChoiceChipsComponent } from './choice-chips.component';

describe('ChoiceChipsComponent', () => {
  it('adds and removes a value without mutating the input array', () => {
    const chips = new ChoiceChipsComponent<number>();
    const emitted: number[][] = [];
    chips.selectedChange.subscribe(value => emitted.push(value));
    chips.selected = [1];

    chips.toggle(2);
    chips.toggle(1);

    expect(emitted).toEqual([[1, 2], []]);
    expect(chips.selected).toEqual([1]);
  });
});
