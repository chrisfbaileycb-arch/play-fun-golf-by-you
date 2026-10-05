// Boardwalk Links suite descriptor.
import { battleship } from './battleship.js';
import { monopoly } from './monopoly.js';
import { sorry } from './sorry.js';
import { chutes } from './chutes.js';
import { mousetrap } from './mousetrap.js';
import { robots } from './robots.js';
import { renderBoardwalkSummary } from './summary.js';
import { tokenSVG, TOKENS } from './board.js';
import { scanScorecardDialog } from './vision.js';
import { PRESETS } from '../core/course.js';

export default {
  id: 'boardwalk',
  name: 'Boardwalk Links',
  tagline: 'Vintage Tabletop Board Games on the Fairway',
  theme: 'boardwalk',

  modes: [
    battleship,
    monopoly,
    sorry,
    chutes,
    mousetrap,
    robots,
  ],

  playerFields: [
    {
      key: 'token',
      label: 'Board Game Token',
      options: TOKENS.map((t) => ({
        value: t.value,
        label: t.label,
        icon: t.value === 'tophat' ? '🎩' : t.value === 'roadster' ? '🚗' : t.value === 'scottie' ? '🐕' : '🧵',
      })),
    },
  ],

  defaultCourse: () => PRESETS.boardwalk(),
  coursePresets: ['boardwalk', 'pitch', 'camelot'],

  zoneButtons: [
    { zone: 'cup', label: 'Holed / Drained!', tone: 'cup', sub: 'Goal Reached' },
    { zone: 'bullseye', label: 'Bullseye (Pin Hunter)', tone: 'gold', sub: 'Critical Roll' },
    { zone: 'inner', label: 'Inner Ring (Birdie)', tone: 'gold', sub: 'Bonus Tiles' },
    { zone: 'green', label: 'Outer Ring (GIR)', tone: 'green', sub: 'On the Board' },
    { zone: 'fairway', label: 'Fairway Advance', tone: 'fair', sub: 'Solid Roll' },
    { zone: 'roughL', label: 'Left Rough', tone: 'rough', sub: 'Slow Roll' },
    { zone: 'roughR', label: 'Right Rough', tone: 'rough', sub: 'Slow Roll' },
    { zone: 'sand', label: 'Bunker Hazard', tone: 'sand', sub: 'Hazard Penalty' },
    { zone: 'water', label: 'Water Hazard', tone: 'water', sub: 'Lose Turn' },
    { zone: 'ob', label: 'Out of Bounds', tone: 'ob', sub: 'Back to Start' },
  ],

  avatar(player, size = 28) {
    const kind = player?.token || 'tophat';
    const color = player?.color || '#d7263d';
    return tokenSVG(kind, color, size, { label: player?.name || 'Pawn' });
  },

  renderSummary(container, game, mode, api) {
    renderBoardwalkSummary(container, game, mode, api);
  },

  scanScorecard: scanScorecardDialog,

  cpuNames: ['Mr. Boardwalk', 'Admiral Cannon', 'Speedy Scottie', 'Red Rocker'],
  cpuDefaults: { token: 'roadster' },
};
