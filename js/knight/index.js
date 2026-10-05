// Knight Golf suite descriptor.
import { castleConquest, duelingKnighthood, raidBoss } from './modes.js';
import { renderKnightSummary } from './summary.js';
import { crestSVG, SIGILS, WEAPONS } from './heraldry.js';
import { PRESETS } from '../core/course.js';
import { svg } from '../core/util.js';

export default {
  id: 'knight',
  name: 'Knight Golf',
  tagline: 'Arcade Target Play & Medieval Combat',
  theme: 'knight',

  modes: [castleConquest, duelingKnighthood, raidBoss],

  playerFields: [
    {
      key: 'sigil',
      label: 'Crest / Sigil',
      options: [
        { value: 'lion', label: 'Lion', icon: SIGILS.lion.icon },
        { value: 'dragon', label: 'Dragon', icon: SIGILS.dragon.icon },
        { value: 'raven', label: 'Raven', icon: SIGILS.raven.icon },
        { value: 'boar', label: 'Boar', icon: SIGILS.boar.icon },
      ],
    },
    {
      key: 'weapon',
      label: 'Weapon Class',
      options: [
        { value: 'broadsword', label: 'Broadsword', icon: WEAPONS.broadsword.icon },
        { value: 'battleaxe', label: 'Battleaxe', icon: WEAPONS.battleaxe.icon },
        { value: 'flail', label: 'War Flail', icon: WEAPONS.flail.icon },
        { value: 'longbow', label: 'Longbow', icon: WEAPONS.longbow.icon },
      ],
    },
  ],

  defaultCourse: () => PRESETS.camelot(),
  coursePresets: ['camelot', 'boardwalk', 'pitch'],

  zoneButtons: [
    { zone: 'cup', label: 'Holed / Drained!', tone: 'cup', sub: '+150 Pts' },
    { zone: 'bullseye', label: 'Bullseye (Pin Hunter)', tone: 'gold', sub: '+100 Pts' },
    { zone: 'inner', label: 'Inner Ring (Birdie Zone)', tone: 'gold', sub: '+60 Pts' },
    { zone: 'green', label: 'Outer Ring (GIR)', tone: 'green', sub: '+40 Pts' },
    { zone: 'fairway', label: 'Fairway Zone', tone: 'fair', sub: '+20 Pts' },
    { zone: 'roughL', label: 'Rough Left', tone: 'rough', sub: '+10 Pts' },
    { zone: 'roughR', label: 'Rough Right', tone: 'rough', sub: '+10 Pts' },
    { zone: 'sand', label: 'Sand (Cracked Armor)', tone: 'sand', sub: 'Shield Damage' },
    { zone: 'water', label: 'Water Hazard', tone: 'water', sub: '+1 Penalty' },
    { zone: 'ob', label: 'Out of Bounds', tone: 'ob', sub: 'Stamina Depleted' },
  ],

  avatar(player, size = 24) {
    return crestSVG(svg, player, size);
  },

  renderSummary(container, game, mode, api) {
    renderKnightSummary(container, game, mode, api);
  },

  cpuNames: ['Sir Lancelot', 'The Black Knight', 'Sir Mordred', 'Lady Guinevere'],
  cpuDefaults: { sigil: 'dragon', weapon: 'broadsword' },
};
