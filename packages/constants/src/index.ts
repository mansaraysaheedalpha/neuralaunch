/**
 * @neuralaunch/constants — shared domain constants.
 *
 * Enum value lists and configuration limits both apps need to agree
 * on. The rule: if mobile ever needs to render, route on, or compare
 * against a value the client also defines, that value lives here.
 *
 * Scope: literal values only. No types beyond enum unions derived
 * from the arrays. No logic, no imports from server code.
 */

export * from './discovery';
export * from './roadmap';
export * from './checkin';
