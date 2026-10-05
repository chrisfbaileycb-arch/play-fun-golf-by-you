# Arcade Links ⛳️🎲⚔️

**Arcade Links** is an end-to-end, single-pass Progressive Web Application (PWA) uniting two virtual arcade golf suites into a unified mobile-first game engine:

1. **Knight Golf**: Interactive target play engine, positive-sum target scoring, combo streak multipliers, procedural heraldry, inter-hole medieval combat duels, and party raid boss battles.
2. **Boardwalk Links**: Retro tabletop board games mapped to golf courses with offline scorecard computer-vision intake, interactive fairway boards, and classic physical game mechanics.

---

## 🚀 Zero-Build Architecture & Deploy Anywhere

- **100% Vanilla ES6 Modules**: Zero npm dependencies, zero build steps, zero Webpack/Vite required.
- **100% Procedural Graphics**: Fairways, radar sweeps, tokens, heraldic shields, and boxing rings rendered in pure HTML5 Canvas and SVG.
- **100% Procedural Web Audio Synth**: All sound effects (sonar pings, clanks, trumpet fanfares, cash registers, sirens, robot springs) synthesized in real-time via the Web Audio API. Zero external audio downloads.
- **Fully Offline PWA**: Ships with service worker (`sw.js`) and W3C Web App Manifest (`manifest.webmanifest`).

### Deploying to GitHub Pages
1. Push this directory to your GitHub repository:
   ```bash
   git add .
   git commit -m "Deploy Arcade Links PWA"
   git push origin main
   ```
2. In GitHub repository settings, go to **Pages** -> **Build and deployment** -> Source: **Deploy from a branch** (`main` / root).
3. Your PWA is instantly live on `https://<username>.github.io/<repo>/`!

### Deploying to Google Firebase Studio / Firebase Hosting
A pre-configured `firebase.json` is included in the project root:
```bash
firebase deploy --only hosting
```
Or open directly inside **Google Firebase Studio / IDX workspace**.

---

## 🎮 Game Suites & Modes

### Suite 1: Knight Golf 🛡️
- **Castle Conquest**: Arcade concentric target rings (+100 Bullseye, +60 Inner, +40 Green, +20 Fairway). Streak combo multipliers (1.0× to 3.0×).
- **Dueling Knighthood**: Inter-hole 1-on-1 martial duels in the canvas arena. Precision strikes break opponent shields and trigger critical damage.
- **Raid Boss (Goliath Dragon)**: Cooperative multiplayer raid. All golfers combine shot scores each hole to whittle down the dragon's 1000 HP.
- **Heraldry & Avatars**: Procedural SVG heraldic shields with 4 house sigils (Lion, Dragon, Raven, Boar) and weapon classes (Broadsword, Battleaxe, Flail, Longbow).
- **Royal Parchment Scroll**: End-of-round parchment certificate bestowing knighthood titles (*The Green Fletcher, Iron Vanguard, The Berserker, Court Jester*).

### Suite 2: Boardwalk Links 🎲
- **Fairway Fleet**: 10×10 radar grid overlaid across fairways. Shots act as artillery coordinates to hunt and sink hidden carriers, flagships, frigates, and scouts.
- **Turf Tycoon**: Fairway zones and greens are deeded properties. Buy land, collect rent from trailing golfers, upgrade green clubhouses, pay hazard Luxury Taxes, or go to the Penalty Box!
- **Fairway Scram!**: Pawn race down the fairway with slide zones and brutal 15-yard Scram Bumps sending opponents back to the tee box.
- **Elevators & Sandtraps**: 100-tile climb. Laser-accurate green shots trigger towering elevators (+20–30 tiles), while hazards send pawns down steep sandtraps.
- **Rube's Golf Gizmo**: 5-stage kinetic contraption (Crank & Gears → Golf Boot → Marble Stairs → Wash Tub → Snap Cage) that springs shut on opponent pawns.
- **Knockout Brawler**: Red Wedge vs. Blue Putter! Golf strikes charge robotic punch meters; precision chin blows trigger the spring-loaded head pop!
- **Tabletop Game-Box Lid**: Retro 1970s/80s cardboard summary tally with downloadable SVG and PNG scorecards.

---

## 📷 Scorecard Computer Vision & Course Builder
- **Simulated Computer Vision Pipeline**: Offline Sobel edge and table-grid detection scanning camera photos of physical course scorecards.
- **Interactive Course Editor**: Custom hole yardages, pars, hazards, and dogleg curvatures.
- **Presets Included**: Camelot Greens (9 holes, Par 36), Boardwalk Municipal (9 holes, Par 36), and Seaside Pitch & Putt (9 holes, Par 27).

---

## 🧪 In-Browser Test Suite
Arcade Links includes a pure in-browser test runner located at `tests/index.html` covering:
- `tests/core.test.js` — Fairway synthesis, zone classification, shot mechanics, handicap and stroke calculations, GPS.
- `tests/knight.test.js` — Combo streaks, positive scoring, duel damage, and raid boss calculations.
- `tests/boardwalk.test.js` — 10×10 grid mathematics, fleet validation, property deed generation, and Turf Tycoon rent.
- `tests/boardwalk2.test.js` — Scram! bumps, Elevators & Sandtraps advancement, Rube's Golf Gizmo stages, and Brawler punch meters.
- `tests/celebration.test.js` — Hole-in-One and Under-Par festive animations and confetti scene verification.
