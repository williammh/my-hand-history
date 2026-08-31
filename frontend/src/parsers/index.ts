import { ParserRegistry } from './registry';
import { betclicParser } from './sites/betclic/index';
import { winamaxParser } from './sites/winamax/index';

export { ParserRegistry } from './registry';
export type { ParserSummary } from './registry';
export * from './types';

/** The app-wide registry. Register new site parsers here. */
export const registry = new ParserRegistry();
registry.register(betclicParser);
registry.register(winamaxParser);
