import { ParserRegistry } from './registry.js';
import { betclicParser } from './sites/betclic/index.js';
import { winamaxParser } from './sites/winamax/index.js';

export { ParserRegistry } from './registry.js';
export type { ParserSummary } from './registry.js';
export * from './types.js';

/** The app-wide registry. Register new site parsers here. */
export const registry = new ParserRegistry();
registry.register(betclicParser);
registry.register(winamaxParser);
