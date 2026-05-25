/**
 * Credits module barrel — V2-006.2
 *
 * Exports both the balance-calculator and credit-reservations façades.
 * Import from here rather than directly from the sub-modules.
 */

export { getBalance } from './balance.js';
export type { CreditBalance } from './balance.js';

export { reserve, commit, release, expireStale } from './reservations.js';
