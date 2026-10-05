// Mode F: Rock 'Em Sock 'Em Robots Duel
import { el, clear, clamp, ease } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { Timeline } from '../core/fx.js';

export const ROBOT_CONFIG = [
  { name: 'Red Rocker', color: '#e74c3c', accent: '#ff7675', visor: '#ffeaa7' },
  { name: 'Blue Bomber', color: '#2980b9', accent: '#74b9ff', visor: '#81ecec' },
  { name: 'Gold Crusher', color: '#f39c12', accent: '#f1c40f', visor: '#ffffff' },
  { name: 'Green Basher', color: '#27ae60', accent: '#2ecc71', visor: '#ffeaa7' },
];

export const robots = {
  id: 'robots',
  name: "Rock 'Em Sock 'Em Duel",
  tagline: 'Charge robotic punches on the fairway — deliver the chin blow to POP the head!',
  icon: '🤖',
  description: 'Golf shots charge your robotic punch meter. Pure strikes land thunderous crosses and hooks. Reduce your rival’s Chin HP to zero to trigger the iconic spring-loaded head pop!',
  minPlayers: 1,
  maxPlayers: 4,
  needsRival: true,

  init(game) {
    const players = {};
    const count = game.players.length;
    game.players.forEach((p, idx) => {
      const cfg = ROBOT_CONFIG[idx % ROBOT_CONFIG.length];
      players[p.id] = {
        name: cfg.name,
        color: cfg.color,
        accent: cfg.accent,
        visor: cfg.visor,
        meter: 0,
        chinHp: 100,
        punchesLanded: 0,
        knockouts: 0,
        headPopped: false,
        headSpringY: 0,
      };
    });

    // If single player, add a CPU rival robot
    let rivalId = null;
    if (count === 1) {
      rivalId = 'cpu_bomber';
      players[rivalId] = {
        name: 'Blue Bomber (CPU)',
        color: '#2980b9',
        accent: '#74b9ff',
        visor: '#81ecec',
        meter: 20,
        chinHp: 100,
        punchesLanded: 0,
        knockouts: 0,
        headPopped: false,
        headSpringY: 0,
      };
    }

    return { players, rivalId, lastDuel: null };
  },

  onShot(game, ctx) {
    const events = [];
    const state = game.modeState;
    const ps = state.players[ctx.player.id];
    if (!ps) return events;

    // Shot quality charges punch meter
    let charge = 10;
    let punchType = 'jab';

    if (ctx.shot.zone === 'cup') {
      charge = 100;
      punchType = 'knockout';
    } else if (ctx.shot.zone === 'bullseye') {
      charge = 50;
      punchType = 'uppercut';
    } else if (['inner', 'green'].includes(ctx.shot.zone)) {
      charge = 35;
      punchType = 'cross';
    } else if (ctx.shot.zone === 'fairway') {
      charge = 20;
      punchType = 'jab';
    } else if (['sand', 'water', 'ob'].includes(ctx.shot.zone)) {
      charge = 0;
      ps.chinHp = Math.max(10, ps.chinHp - 15);
      events.push({ t: 'sfx', name: 'block' });
      events.push({ t: 'banner', text: 'COUNTERED!', sub: 'Hazard Lie — Chin HP Damaged (-15)', color: '#ff5e57' });
      return events;
    }

    ps.meter = Math.min(100, ps.meter + charge);
    events.push({ t: 'sfx', name: 'ratchet' });

    if (punchType === 'knockout') {
      events.push({ t: 'sfx', name: 'bigPunch' });
      events.push({ t: 'banner', text: 'OVERDRIVE CHARGED!', sub: 'Cup Drain: Maximum Punch Power!', color: '#ffdd59' });
    } else if (ps.meter >= 100) {
      events.push({ t: 'sfx', name: 'bell' });
      events.push({ t: 'banner', text: 'PUNCH METER FULL!', sub: 'Ready for Chin Blow!', color: '#ff3f34' });
    } else {
      events.push({ t: 'banner', text: `PUNCH METER +${charge}%`, sub: `${ps.name} charging (${ps.meter}%)`, color: ps.accent });
    }

    return events;
  },

  onHoleEnd(game, results) {
    const events = [];
    const state = game.modeState;
    const pIds = Object.keys(state.players);

    // Pick top 2 combatants: p1 and p2 (or p1 and cpu)
    const p1Id = game.players[0].id;
    const p2Id = game.players[1] ? game.players[1].id : state.rivalId;

    const r1 = results[p1Id] || { strokes: 4, bestZone: 'fairway' };
    const r2 = results[p2Id] || { strokes: 4, bestZone: 'fairway' };

    const ps1 = state.players[p1Id];
    const ps2 = state.players[p2Id];

    // Determine attacker: lower strokes or higher meter
    let attackerId = p1Id;
    let defenderId = p2Id;
    if (r2.strokes < r1.strokes || (r2.strokes === r1.strokes && ps2.meter > ps1.meter)) {
      attackerId = p2Id;
      defenderId = p1Id;
    }

    const atk = state.players[attackerId];
    const def = state.players[defenderId];

    const damage = Math.round(20 + (atk.meter * 0.4));
    atk.meter = Math.max(0, atk.meter - 60);
    atk.punchesLanded++;
    def.chinHp = Math.max(0, def.chinHp - damage);

    let headPopped = false;
    if (def.chinHp <= 0) {
      def.headPopped = true;
      def.headSpringY = 32;
      atk.knockouts++;
      headPopped = true;
      events.push({ t: 'sfx', name: 'headPop' });
      events.push({ t: 'sfx', name: 'bell' });
      events.push({ t: 'banner', text: 'K.O.! HEAD POPPED!', sub: `${atk.name} knocked ${def.name}'s block off!`, color: '#ff3838' });
    } else {
      events.push({ t: 'sfx', name: 'punch' });
      events.push({ t: 'banner', text: 'CHIN BLOW!', sub: `${atk.name} hits ${def.name} for -${damage} Chin HP`, color: atk.accent });
    }

    state.lastDuel = {
      attackerId,
      defenderId,
      damage,
      headPopped,
      hole: game.holeIndex + 1,
    };

    return events;
  },

  renderScoreboard(container, game) {
    clear(container);
    const state = game.modeState;
    if (!state) return;

    const wrap = el('div', { class: 'robots-scoreboard' });
    for (const [pid, ps] of Object.entries(state.players)) {
      const row = el('div', { class: 'robot-score-row', style: `border-left: 6px solid ${ps.color};` }, [
        el('div', { class: 'robot-score-hdr' }, [
          el('strong', { text: ps.name, style: `color: ${ps.accent};` }),
          el('span', { text: `K.O.s: ${ps.knockouts}` }),
        ]),
        el('div', { class: 'robot-meter-bar' }, [
          el('div', { class: 'robot-meter-fill', style: `width: ${ps.meter}%; background: ${ps.color};` }),
        ]),
        el('div', { class: 'robot-chin-bar' }, [
          el('div', { class: 'robot-chin-fill', style: `width: ${ps.chinHp}%; background: ${ps.chinHp < 30 ? '#ff3838' : '#2ecc71'};` }),
          el('span', { class: 'chin-label', text: ps.headPopped ? 'HEAD POPPED!' : `Chin: ${ps.chinHp}%` }),
        ]),
      ]);
      wrap.appendChild(row);
    }
    container.appendChild(wrap);
  },

  renderOverlay(container, game) {
    clear(container);
    const state = game.modeState;
    if (!state) return;

    const p1Id = game.players[0].id;
    const p2Id = game.players[1] ? game.players[1].id : state.rivalId;
    const ps1 = state.players[p1Id];
    const ps2 = state.players[p2Id];

    const box = el('div', { class: 'robots-ring-box' });
    const cvs = el('canvas', { width: 340, height: 200, class: 'robots-canvas' });
    box.appendChild(cvs);

    const ctx = cvs.getContext('2d');
    drawRingAndRobots(ctx, 340, 200, ps1, ps2, state.lastDuel);

    const controls = el('div', { class: 'robots-ring-controls' }, [
      el('button', {
        class: 'btn-arcade btn-sm',
        text: '🥊 TEST JAB',
        onClick: () => {
          sfx.play('punch');
          if (ps1) ps1.meter = Math.min(100, ps1.meter + 15);
          drawRingAndRobots(ctx, 340, 200, ps1, ps2, { attackerId: p1Id, defenderId: p2Id, damage: 10, headPopped: false });
        },
      }),
      el('button', {
        class: 'btn-arcade btn-sm',
        text: '💥 TEST POP',
        onClick: () => {
          sfx.play('headPop');
          if (ps2) {
            ps2.headPopped = true;
            ps2.headSpringY = 28;
            ps2.chinHp = 0;
          }
          drawRingAndRobots(ctx, 340, 200, ps1, ps2, { attackerId: p1Id, defenderId: p2Id, damage: 100, headPopped: true });
        },
      }),
    ]);
    box.appendChild(controls);
    container.appendChild(box);
  },
};

/** Draw the classic yellow tabletop boxing ring with Red Rocker and Blue Bomber */
export function drawRingAndRobots(ctx, w, h, p1, p2, duel) {
  ctx.clearRect(0, 0, w, h);

  // Ring floor: bright arcade yellow
  ctx.fillStyle = '#f1c40f';
  ctx.fillRect(20, 20, w - 40, h - 35);
  ctx.strokeStyle = '#d4ac0d';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, w - 40, h - 35);

  // Corner turnbuckle posts
  const corners = [
    [20, 20], [w - 20, 20],
    [20, h - 15], [w - 20, h - 15],
  ];
  for (const [cx, cy] of corners) {
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ring ropes (3 horizontal lines)
  ctx.strokeStyle = '#ecf0f1';
  ctx.lineWidth = 2.5;
  for (let r = 0; r < 3; r++) {
    const ry = 40 + r * 30;
    ctx.beginPath();
    ctx.moveTo(20, ry);
    ctx.lineTo(w - 20, ry);
    ctx.stroke();
  }

  // Draw Robot 1 (Red Rocker) on left
  drawRobotFigure(ctx, 95, 125, p1 || { color: '#e74c3c', accent: '#ff7675', visor: '#ffeaa7' }, 1, duel && duel.attackerId === p1?.id);

  // Draw Robot 2 (Blue Bomber) on right
  drawRobotFigure(ctx, w - 95, 125, p2 || { color: '#2980b9', accent: '#74b9ff', visor: '#81ecec' }, -1, duel && duel.attackerId === p2?.id);
}

function drawRobotFigure(ctx, x, y, robot, facing, isAttacking) {
  ctx.save();
  ctx.translate(x, y);

  // Spring neck if head is popped
  const springOffset = robot.headPopped ? 26 : 0;
  if (robot.headPopped) {
    ctx.strokeStyle = '#bdc3c7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -30);
    for (let i = 0; i < 6; i++) {
      ctx.lineTo(i % 2 === 0 ? -6 : 6, -30 - (i * 4.5));
    }
    ctx.lineTo(0, -30 - springOffset);
    ctx.stroke();
  }

  // Square Robot Head
  const headY = -48 - springOffset;
  ctx.fillStyle = robot.color;
  ctx.fillRect(-14, headY, 28, 22);
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 2;
  ctx.strokeRect(-14, headY, 28, 22);

  // Visor slit
  ctx.fillStyle = robot.visor || '#ffeaa7';
  ctx.fillRect(facing === 1 ? -2 : -10, headY + 6, 12, 5);

  // Jaw / Chin trigger plate
  ctx.fillStyle = '#7f8c8d';
  ctx.fillRect(-10, headY + 18, 20, 5);

  // Torso / Body block
  ctx.fillStyle = robot.color;
  ctx.fillRect(-22, -26, 44, 40);
  ctx.strokeStyle = '#1a252f';
  ctx.lineWidth = 2;
  ctx.strokeRect(-22, -26, 44, 40);

  // Chest emblem / grill
  ctx.fillStyle = robot.accent;
  for (let g = 0; g < 3; g++) {
    ctx.fillRect(-14, -18 + g * 8, 28, 4);
  }

  // Robotic Arms & Boxing Gloves
  const punchReach = isAttacking ? 28 : 8;
  ctx.fillStyle = robot.color;
  // Left arm
  ctx.fillRect(-28, -20, 8, 24);
  // Punching glove
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.arc(facing * (14 + punchReach), -8, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2c3e50';
  ctx.stroke();

  // Plastic Base post
  ctx.fillStyle = '#34495e';
  ctx.fillRect(-8, 14, 16, 20);

  ctx.restore();
}
