# Graph Report - my-hand-history  (2026-08-31)

## Corpus Check
- 153 files · ~160,862 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 720 nodes · 1789 edges · 25 communities (20 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.81)
- Token cost: 100,016 input · 0 output

## Community Hubs (Navigation)
- Replay & Decision Points
- Upload Parse Reporting
- Preflop Chart Loader
- Hand Class Heuristic Engine
- Analysis Verdict UI
- Hand History Format Concepts
- Frontend Package Dependencies
- Frontend TS Config
- Backend Stub & Docs
- Filter Panel UI
- Workers TS Config
- App Shell & Upload UI
- Filter Domain Types
- Backend Package Config
- Card & Board Domain
- Filter Matching Logic
- Root Package Workspace
- Hand Facts Derivation
- Hands Store Tests
- App Shell Pages
- Backend Worker Entry
- Root Layout
- Next Config
- PostCSS Config

## God Nodes (most connected - your core abstractions)
1. `Hand` - 46 edges
2. `amount` - 32 edges
3. `asAmount()` - 28 edges
4. `Street` - 22 edges
5. `compilerOptions` - 22 edges
6. `SiteId` - 21 edges
7. `Position` - 20 edges
8. `HandAnalysis` - 19 edges
9. `useDisplayStore` - 18 edges
10. `compilerOptions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Next.js Agent Rules Block` --conceptually_related_to--> `frontend/app/ (Next App Router Entry)`  [INFERRED]
  frontend/AGENTS.md → README.md
- `Props` --references--> `Hand`  [EXTRACTED]
  frontend/src/components/hands/HandList.tsx → frontend/src/domain/hand.ts
- `splitSections()` --calls--> `warn()`  [EXTRACTED]
  frontend/src/parsers/sites/betclic/index.ts → frontend/src/parsers/shared/warnings.ts
- `backend/ Workspace (Stub Cloudflare Worker)` --references--> `@my-hand-history/api`  [EXTRACTED]
  README.md → backend/README.md
- `Betclic.fr Hand History Parsing` --conceptually_related_to--> `Betclic.fr (Poker Room)`  [EXTRACTED]
  README.md → frontend/tests/fixtures/betclic/sample.txt

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Betclic Fixture Files Exercising the Betclic Parser** — fixture_betclic_sample_txt, fixture_betclic_deep_3bet_txt, fixture_betclic_showdown_edge_cases_txt, readme_betclic_parser_support, readme_shared_validate [INFERRED 0.85]
- **Winamax Fixture and Sample Files Exercising the Winamax Parser** — fixture_winamax_alcacer_do_sal_txt, fixture_winamax_synthetic_edge_cases_txt, samples_alcacer_do_sal_02_txt, readme_winamax_parser_support [INFERRED 0.85]
- **Layered Frontend Architecture (app / domain / parsers / analysis)** — readme_app_router_entry, readme_domain_layer, readme_parsers_layer, readme_analysis_layer [EXTRACTED 1.00]

## Communities (25 total, 4 thin omitted)

### Community 0 - "Replay & Decision Points"
Cohesion: 0.05
Nodes (64): DecisionPoint, Props, ReplayControls(), Action, ActionKind, CHIP_MOVING, FORCED, Board (+56 more)

### Community 1 - "Upload Parse Reporting"
Cohesion: 0.06
Nodes (46): hasErrors(), ParseReport(), Props, Props, ParseSeverity, ParseWarning, SiteId, heroStartingStackBB() (+38 more)

### Community 2 - "Preflop Chart Loader"
Cohesion: 0.06
Nodes (30): ChartLoader, ChartManifest, ChartManifestEntry, PreflopChart, ChartLookup, ChartMatch, ChartQuery, MAX_STACK_DELTA_BB (+22 more)

### Community 3 - "Hand Class Heuristic Engine"
Cohesion: 0.08
Nodes (56): allHandClasses(), classOf(), comboCount(), extractDecisions(), EngineCapabilities, createClientHeuristicEngine(), judgeBet(), judgeCheck() (+48 more)

### Community 4 - "Analysis Verdict UI"
Cohesion: 0.07
Nodes (51): DecisionVerdict, SkippedDecision, SuggestedAction, SuggestedKind, AnalysisPanel(), VerdictIcon(), gtoLine(), heroLine() (+43 more)

### Community 5 - "Hand History Format Concepts"
Cohesion: 0.07
Nodes (40): 3-Bet Pot, All-In Action, Betclic.fr (Poker Room), Blinds/Ante Structure, Cash Game Hand History, Poker Hand History Text Format, Heads-Up Hand, Big Blind Posted Out of Position (+32 more)

### Community 6 - "Frontend Package Dependencies"
Cohesion: 0.04
Nodes (45): autoprefixer, dependencies, idb, next, radix-ui, react, react-dom, @tabler/icons-react (+37 more)

### Community 7 - "Frontend TS Config"
Cohesion: 0.05
Nodes (37): compilerOptions, allowJs, esModuleInterop, exactOptionalPropertyTypes, incremental, isolatedModules, jsx, lib (+29 more)

### Community 8 - "Backend Stub & Docs"
Cohesion: 0.08
Nodes (30): Accounts and Sync (Planned), @my-hand-history/api, src/index.ts Env Typing, HandRepository Interface, GET /health Route, No Shared Code with Frontend Yet, packages/ Workspace for Shared Code, POST /analyze (Planned Solver Endpoint) (+22 more)

### Community 9 - "Filter Panel UI"
Cohesion: 0.14
Nodes (20): FilterMenu(), Props, countsOf(), FiltersPanel(), CONNECTEDNESS, linesFor(), Option, POSITIONS (+12 more)

### Community 10 - "Workers TS Config"
Cohesion: 0.09
Nodes (21): compilerOptions, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+13 more)

### Community 11 - "App Shell & Upload UI"
Cohesion: 0.15
Nodes (14): App(), Props, ScrollArea(), FileDropzone(), Props, UploadedFile, SiteRadioGroup(), replayTimeline() (+6 more)

### Community 12 - "Filter Domain Types"
Cohesion: 0.22
Nodes (16): Severity, Rank, Connectedness, SuitTexture, FilterCriteria, HandFacts, LineToken, PotType (+8 more)

### Community 13 - "Backend Package Config"
Cohesion: 0.12
Nodes (15): devDependencies, @cloudflare/workers-types, typescript, wrangler, typescript, name, private, scripts (+7 more)

### Community 14 - "Card & Board Domain"
Cohesion: 0.26
Nodes (10): cardSuit(), isCard(), parseCard(), parseCardList(), RANKS, rankValue(), Suit, boardTexture (+2 more)

### Community 15 - "Filter Matching Logic"
Cohesion: 0.25
Nodes (7): stackBucket(), activeCount(), isActive(), matches(), EMPTY_CRITERIA, keep(), SITE_NAMES

### Community 16 - "Root Package Workspace"
Cohesion: 0.14
Nodes (13): name, private, scripts, build, dev, start, test, typecheck (+5 more)

### Community 17 - "Hand Facts Derivation"
Cohesion: 0.35
Nodes (10): isVoluntary(), postflopOrder(), heroEffectiveStackBB(), AGGRESSIVE, deriveFacts(), derivePotType(), lineToken(), relativeTo() (+2 more)

### Community 18 - "Hands Store Tests"
Cohesion: 0.40
Nodes (4): read(), SESSION_A, SESSION_B, url()

### Community 20 - "Backend Worker Entry"
Cohesion: 0.67
Nodes (3): Env, fetch(), json()

## Knowledge Gaps
- **179 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+174 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 231 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Hand` connect `Preflop Chart Loader` to `Replay & Decision Points`, `Upload Parse Reporting`, `Hand Class Heuristic Engine`, `Analysis Verdict UI`, `Filter Matching Logic`, `Hand Facts Derivation`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `amount` connect `Replay & Decision Points` to `Preflop Chart Loader`, `Analysis Verdict UI`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `HandAnalysis` connect `Preflop Chart Loader` to `Hand Facts Derivation`, `Hand Class Heuristic Engine`, `Analysis Verdict UI`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _179 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Replay & Decision Points` be split into smaller, more focused modules?**
  _Cohesion score 0.052277227722772275 - nodes in this community are weakly interconnected._
- **Should `Upload Parse Reporting` be split into smaller, more focused modules?**
  _Cohesion score 0.056338028169014086 - nodes in this community are weakly interconnected._
- **Should `Preflop Chart Loader` be split into smaller, more focused modules?**
  _Cohesion score 0.05995975855130785 - nodes in this community are weakly interconnected._