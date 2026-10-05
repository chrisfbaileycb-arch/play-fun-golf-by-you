// Retro Cardboard Game-Box Lid post-round summary for Boardwalk Links.
import { el, clear } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { buildSVGReport, downloadSVG, svgToPNG } from '../core/store.js';
import { leaderBy } from '../core/stats.js';

export function renderBoardwalkSummary(container, game, mode, api) {
  clear(container);
  sfx.play('dice');
  setTimeout(() => sfx.play('fanfare'), 350);

  const standings = api.standings || [];
  const stats = api.stats || [];

  // Determine Game-Box Badge / Title
  let grandTitle = 'Boardwalk Champion';
  let badgeIcon = '🎲';
  if (mode.id === 'battleship') {
    grandTitle = 'Fleet Admiral';
    badgeIcon = '⚓';
  } else if (mode.id === 'monopoly') {
    grandTitle = 'Boardwalk Tycoon';
    badgeIcon = '🎩';
  } else if (mode.id === 'sorry') {
    grandTitle = 'Bump Master';
    badgeIcon = '💥';
  } else if (mode.id === 'chutes') {
    grandTitle = 'Ladder Climber';
    badgeIcon = '🪜';
  } else if (mode.id === 'mousetrap') {
    grandTitle = 'Chief Trapsmith';
    badgeIcon = '🪤';
  } else if (mode.id === 'robots') {
    grandTitle = 'Heavyweight Champ';
    badgeIcon = '🥊';
  }

  // Bestow board awards
  const awards = [];
  const driveChamp = leaderBy(stats, 'longestCarry');
  if (driveChamp && driveChamp.v > 0) {
    const p = game.players.find((x) => x.id === driveChamp.pid);
    awards.push({ title: 'Long-Drive Ace', name: p?.name || 'Player', desc: `${driveChamp.v} yds` });
  }

  const pinSeeker = leaderBy(stats, 'closest', { min: true, requirePositive: true });
  if (pinSeeker) {
    const p = game.players.find((x) => x.id === pinSeeker.pid);
    awards.push({ title: 'Pin Magnet', name: p?.name || 'Player', desc: `${pinSeeker.v} yds to cup` });
  }

  const fairwayKing = leaderBy(stats, 'fairways');
  if (fairwayKing && fairwayKing.v > 0) {
    const p = game.players.find((x) => x.id === fairwayKing.pid);
    awards.push({ title: 'Fairway Navigator', name: p?.name || 'Player', desc: `${fairwayKing.v} fairways hit` });
  }

  // Construct Retro Game Box Lid
  const boxWrap = el('div', { class: 'gamebox-lid-wrap' });
  const lid = el('div', { class: 'gamebox-lid', role: 'region', 'aria-label': 'Board Game Final Results' });

  // Retro Header
  const header = el('div', { class: 'gamebox-header' }, [
    el('div', { class: 'gamebox-badge-icon', 'aria-hidden': 'true' }, [el('span', { text: badgeIcon })]),
    el('h2', { class: 'gamebox-title', text: 'OFFICIAL GAME TALLY' }),
    el('p', { class: 'gamebox-subtitle', text: `${mode.name} · ${game.course.name}` }),
  ]);

  // Winner Announcement Banner
  const topPlayer = standings[0];
  const winnerObj = game.players.find((p) => p.id === topPlayer?.pid) || game.players[0];
  const winnerBanner = el('div', { class: 'gamebox-winner-banner' }, [
    el('div', { class: 'winner-crown', text: '🏆' }),
    el('div', { class: 'winner-headline', text: `${winnerObj?.name || 'Player 1'} IS THE ${grandTitle.toUpperCase()}!` }),
    el('div', { class: 'winner-subline', text: `Final Standing: ${topPlayer?.text || '1st Place'}` }),
  ]);

  // Standings Table
  const table = el('table', { class: 'gamebox-table' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', { text: 'Rank' }),
        el('th', { text: 'Token & Player' }),
        el('th', { style: 'text-align: right;', text: 'Result' }),
      ]),
    ]),
    el('tbody', {}, standings.map((s, idx) => {
      const p = game.players.find((x) => x.id === s.pid) || { name: 'Player', token: 'hat' };
      return el('tr', { class: idx === 0 ? 'top-rank' : '' }, [
        el('td', { class: 'rank-cell', text: `#${idx + 1}` }),
        el('td', { class: 'player-cell' }, [
          el('span', { class: 'player-name', text: p.name }),
        ]),
        el('td', { style: 'text-align: right;', class: 'score-cell', text: s.text || `${s.score ?? 0}` }),
      ]);
    })),
  ]);

  // Accolades Grid
  const accoladesSection = el('div', { class: 'gamebox-accolades' }, [
    el('h3', { class: 'gamebox-sec-title', text: '🏅 Tabletop Accolades' }),
    el('div', { class: 'accolades-grid' }, awards.map((a) =>
      el('div', { class: 'accolade-card' }, [
        el('strong', { class: 'accolade-title', text: a.title }),
        el('div', { class: 'accolade-name', text: a.name }),
        el('span', { class: 'accolade-desc', text: a.desc }),
      ])
    )),
  ]);

  // Action Buttons
  const actions = el('div', { class: 'gamebox-actions' }, [
    el('button', {
      class: 'btn-arcade btn-primary',
      text: '💾 DOWNLOAD SVG REPORT',
      onClick: () => {
        sfx.play('coin');
        const svgStr = buildSVGReport(game, standings, stats);
        downloadSVG(svgStr, `Boardwalk-${mode.id}-scorecard.svg`);
      },
    }),
    el('button', {
      class: 'btn-arcade btn-secondary',
      text: '🖼️ SAVE PNG SCORECARD',
      onClick: async () => {
        sfx.play('coin');
        const svgStr = buildSVGReport(game, standings, stats);
        const dataUrl = await svgToPNG(svgStr);
        const a = el('a', { href: dataUrl, download: `Boardwalk-${mode.id}-scorecard.png` });
        document.body.appendChild(a);
        a.click();
        a.remove();
      },
    }),
    el('button', {
      class: 'btn-arcade',
      text: '🔄 PLAY AGAIN',
      onClick: () => api.restartRound(),
    }),
    el('button', {
      class: 'btn-arcade btn-danger',
      text: '🏠 MAIN MENU',
      onClick: () => api.showLauncher(),
    }),
  ]);

  lid.append(header, winnerBanner, table, accoladesSection, actions);
  boxWrap.appendChild(lid);
  container.appendChild(boxWrap);
}
