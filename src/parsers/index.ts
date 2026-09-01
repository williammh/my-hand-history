import { ParserRegistry } from './registry';
import { betclicParser } from './sites/betclic/index';
import { winamaxParser } from './sites/winamax/index';
import {
  coinpokerParser, ggpokerParser, pokerstarsLikeParser, pokerstarsParser, wptGlobalParser,
} from './sites/pokerstars/index';
import { pokr888Parser } from './sites/pokr888/index';

export { ParserRegistry } from './registry';
export type { ParserSummary } from './registry';
export * from './types';

/** The app-wide registry. Register new site parsers here. */
export const registry = new ParserRegistry();
registry.register(betclicParser);
registry.register(winamaxParser);
registry.register(pokerstarsParser);
registry.register(coinpokerParser);
registry.register(wptGlobalParser);
registry.register(ggpokerParser);
registry.register(pokr888Parser);
// Registered last: it only ever wins a file no other parser recognizes at all.
registry.register(pokerstarsLikeParser);
