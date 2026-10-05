# Arcade Links — Agent Guide (Knight Golf + Boardwalk Links)

Offline PWA, **vanilla ES modules, no build step, no external assets/CDNs**. Serve with
`python3 -m http.server 8765` from this folder. Unit tests: open `/tests/index.html`.

ECC (Everything Claude Code) rules live in `.agents/rules/` and selected ECC skills in `.agents/skills/`.
Follow them: no `innerHTML` with dynamic data (use `el()` from `js/core/util.js`), compositor-friendly
motion, honour `prefers-reduced-motion`, ≥52px touch targets, visible focus states, ARIA live for events.

## Layout
```
index.html  styles.css (@imports css/*.css)  app.js (bootstrap + flow controller)
js/core/    util fairway course shots game stats audio fx radar gps ui store courseEditor
js/knight/  index.js (suite descriptor) + scoring/combat/arena/summary … (Knight Golf)
js/boardwalk/ index.js (suite descriptor) + vision/battleship/monopoly/sorry/chutes/mousetrap/robots/summary
css/        base handled in styles.css; css/knight.css and css/boardwalk.css owned by each suite
tests/      index.html + *.test.js (tiny in-browser harness in tests/harness.js)
```

## Hole space
Yards. Tee at (0,0); +y toward pin; +x = golfer's right. `synthesize(hole)` → geo
(`path, pin, green{x,y,r}, bunkers[], water[], landingZones[], fairwayWidth, fairwayStart, fairwayEnd, bounds`).
Unified zones: `cup bullseye inner green fairway roughL roughR sand water ob` (`classifyPoint` never returns `cup`;
holing is explicit). Water/OB = 1 penalty stroke, ball returns to `from` (stroke & distance). Auto-pickup at par+5.

## Shot record (game.holes[i].shots[pid][])
`{pid, stroke, type:'drive'|'approach'|'sand'|'putt', zone, from, to, carry, offline, distBefore, distToPin, ring:'bullseye'|'inner'|'outer'|null, holed, penalty, source}`

## Game state (JSON only — persisted to localStorage)
`{version, id, suite, modeId, options, players:[{id,name,color,cpu?,skill?, ...suite fields}], course, holeIdx, phase, holes:[{shots,done,pickup}], modeState, log, createdAt, finishedAt}`
Modes store ALL their data in `game.modeState` (plain JSON, no class instances / functions).

## Suite descriptor (default export of js/<suite>/index.js)
```js
{
  id, name, tagline, theme,                 // theme: 'knight' | 'boardwalk' (body[data-theme])
  modes: [Mode, ...],
  playerFields: [{ key, label, options:[{value,label,icon}] }],   // e.g. sigil, weapon / token
  defaultCourse(): course,                  // e.g. PRESETS.camelot()
  coursePresets: ['camelot','boardwalk','pitch'],
  renderCourseStep?(container, { course, setCourse }),  // optional custom course UI (Boardwalk vision). Core editor otherwise.
  zoneButtons: [{ zone, label, sub, tone }],  // tone: 'gold'|'green'|'fair'|'rough'|'sand'|'water'|'ob' (CSS hook)
  renderSummary(container, game, mode, api),  // api: { exportJSON(), restart(), home(), standings, stats }
  cpuNames: ['Black Knight', ...], cpuDefaults: { ...playerFields defaults }
}
```

## Mode plugin
```js
{
  id, name, tagline, icon, description,   // description = rules text shown in lobby
  minPlayers, maxPlayers, needsRival?,     // needsRival: lobby auto-adds a CPU if only 1 human
  init(game) -> modeState,
  setup?(container, game, done),           // optional DOM step before hole 1 (e.g. Battleship fleet deploy)
  onShot(game, ctx) -> Event[],            // ctx: { player, shot, geo, hole, holeIdx }
  shotScene?(game, ctx) -> scene|null,     // optional short (<3.5s) canvas scene after a shot
  onHoleComplete(game, ctx) -> Event[],    // ctx: { holeIdx, hole, geo, results }  results = holeResults(game)
  scene?(game, ctx) -> scene|null,         // between-hole canvas scene (arena / board / contraption)
  overlay?(ctx2d, view, game, t),          // draw on radar; view.toScreen(p), view.k (px per yard)
  panel?(container, game, api),            // mode status panel under the radar (re-rendered after each shot)
                                           // api: { refresh() (save+rerender HUD/panel), save(), playEvents(events), selectedPid }
                                           // Interactive choices (e.g. Monopoly Buy/Pass) mutate game.modeState then call api.refresh().
  hud(game) -> [{ pid, value, label, badge?, bar?:{value,max,color} }],
  standings(game) -> [{ pid, score, display }],   // best first
  isOver?(game) -> boolean,                // early finish (boss slain, fleet sunk, bankrupt)
}
```
Logic (`init/onShot/onHoleComplete/hud/standings/isOver`) must be **pure-ish and DOM-free** (testable).
Events: `{t:'sfx',name}` `{t:'banner',text,sub?,color?}` `{t:'toast',text}` `{t:'shake',mag}` `{t:'haptic',pattern}` `{t:'log',text}`.

## Scenes (`runScene(canvas, scene)` in js/core/fx.js)
`{ init?(api), update(dt, api), draw(ctx, w, h, api), done:false, holdMs?, result?, onSkip?(), title?, caption? }` — api: `{fx, w, h, t}`.
`title` is shown above the canvas; `caption` is polled every 150ms (update it from the timeline for play-by-play text).
Set `scene.done = true` when finished. `api.fx` has `sparks/smoke/confetti/text/shake/flash`. Sounds: `sfx.play(name)`
(see SOUNDS in js/core/audio.js).
