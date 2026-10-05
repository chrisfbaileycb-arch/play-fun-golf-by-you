// Positive-sum arcade scoring engine for Knight Golf (pure).
import { dist } from '../core/util.js';

export const ZONE_POINTS = {
  cup: 150,
  bullseye: 100,
  inner: 60,
  green: 40,
  fairway: 20,
  roughL: 10,
  roughR: 10,
  sand: 5,
  water: 0,
  ob: 0,
};

/**
 * Score a shot in Knight Golf rules.
 * Updates player combo, points, XP and statuses in modeState.
 * Returns { pts, xp, combo, events }
 */
export function scoreShot(shot, geo, playerState) {
  const events = [];
  const basePts = ZONE_POINTS[shot.zone] ?? 10;
  
  // Landing zone bonus on long par 4/5s
  let lzBonus = 0;
  if (shot.zone === 'fairway' && geo.landingZones) {
    for (const lz of geo.landingZones) {
      if (dist(shot.to, lz) <= lz.r) {
        lzBonus = 20;
        break;
      }
    }
  }

  let combo = playerState.combo || 1.0;
  let prevCombo = combo;

  // Combo mechanics:
  // Good zones increase combo; rough holds combo; hazards break combo
  const isGreat = ['cup', 'bullseye', 'inner', 'green', 'fairway'].includes(shot.zone);
  const isHazard = ['sand', 'water', 'ob'].includes(shot.zone);

  if (isGreat) {
    combo = Math.min(3.0, Math.round((combo + 0.5) * 10) / 10);
    if (combo > prevCombo && combo >= 1.5) {
      events.push({ t: 'sfx', name: 'combo', level: Math.round(combo * 2) });
      events.push({ t: 'banner', text: `COMBO ×${combo.toFixed(1)}!`, sub: `${basePts + lzBonus} Pts × ${combo.toFixed(1)}`, color: '#ffd76a' });
    }
  } else if (isHazard) {
    if (combo > 1.0) {
      events.push({ t: 'sfx', name: 'undo' });
      events.push({ t: 'toast', text: 'Combo Broken!' });
    }
    combo = 1.0;
  }

  // Statuses
  if (shot.zone === 'sand') {
    playerState.crackedArmor = true;
    events.push({ t: 'toast', text: '🛡️ Cracked Armor! Defensive penalty next duel.' });
  } else if (shot.zone === 'ob') {
    playerState.staminaDepleted = true;
    events.push({ t: 'toast', text: '⚡ Stamina Depleted!' });
  }

  const earnedPts = Math.round((basePts + lzBonus) * combo);
  const gainedYards = Math.max(0, Math.round(shot.carry || 0));
  const earnedXp = earnedPts + Math.round(gainedYards * 0.5);

  playerState.combo = combo;
  playerState.points = (playerState.points || 0) + earnedPts;
  playerState.xp = (playerState.xp || 0) + earnedXp;

  if (shot.zone === 'cup') {
    events.push({ t: 'banner', text: 'DRAINED!', sub: `+${earnedPts} Points!`, color: '#33b36b' });
  } else if (shot.zone === 'bullseye') {
    events.push({ t: 'banner', text: 'PIN HUNTER!', sub: `Bullseye! +${earnedPts} Pts`, color: '#ffd76a' });
  }

  return { pts: earnedPts, xp: earnedXp, combo, events };
}
