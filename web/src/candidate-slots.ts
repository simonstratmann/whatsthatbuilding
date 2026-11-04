// Each Candidate's colour is set in style.css, on the slot-N classes; these name them.

/**
 * The class that gives a Candidate its colour, by number, the same in the Sight View, on the
 * map and in the list: Candidate 1 is slot-1, and so on.
 */
export function slotClass(number: number): string {
  return `slot-${number}`;
}
