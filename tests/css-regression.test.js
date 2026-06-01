import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('app/styles.css', 'utf8');

function compact(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function ruleBodies(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'gm'))].map((match) => compact(match[1]));
}

function ruleIncludes(selector, declarations) {
  const bodies = ruleBodies(selector);
  assert.ok(bodies.length > 0, `Missing CSS rule for ${selector}`);
  for (const declaration of declarations) {
    assert.ok(
      bodies.some((body) => new RegExp(declaration).test(body)),
      `${selector} should include ${declaration}; actual: ${bodies.join(' | ')}`,
    );
  }
}

test('core layout CSS blocks stay present after tracker UI updates', () => {
  assert.doesNotMatch(css, /<<<<<<<|=======|>>>>>>>/, 'CSS must not contain unresolved merge markers');

  ruleIncludes('.home-hero', [
    'grid-template-columns:\\s*minmax\\(180px, 0\\.55fr\\) minmax\\(280px, 1fr\\)',
    'min-height:\\s*clamp\\(180px, 28dvh, 310px\\)',
    'padding:\\s*clamp\\(28px, 5dvh, 62px\\) min\\(76px, 7vw\\)',
  ]);

  ruleIncludes('.home-dashboard', [
    'display:\\s*grid',
    'grid-template-rows:\\s*auto auto minmax\\(0, 1fr\\)',
    'overflow:\\s*hidden',
  ]);

  ruleIncludes('.feeding-guidance', [
    'display:\\s*grid',
    'border-bottom:\\s*1px solid var\\(--hairline\\)',
  ]);

  ruleIncludes('.feeding-progress-panel', [
    'display:\\s*grid',
    'grid-template-columns:\\s*minmax\\(180px, 0\\.8fr\\) repeat\\(2, minmax\\(0, 1fr\\)\\)',
  ]);
});

test('floating panels and gallery CSS keep usable tablet/desktop layout', () => {
  ruleIncludes('.app-floating-panel', [
    'position:\\s*fixed',
    'width:\\s*min\\(640px, calc\\(100% - 32px\\)\\)',
    'max-height:\\s*min\\(78vh, 760px\\)',
    'z-index:\\s*24',
  ]);

  ruleIncludes('.app-menu-button', [
    'position:\\s*relative',
    'z-index:\\s*25',
  ]);

  ruleIncludes('.task-composer.app-floating-panel', [
    'display:\\s*block',
    'margin:\\s*0',
  ]);

  const taskPositionRule = css.match(/\.task-layout > \.app-floating-panel,\s*\.task-composer\.app-floating-panel\s*\{([^}]*)\}/m);
  assert.ok(taskPositionRule, 'Missing combined task floating panel position rule');
  assert.match(compact(taskPositionRule[1]), /top:\s*calc\(44px \+ 76px\)/, 'Task composer should open below the module menu, not under it');

  ruleIncludes('.growth-summary.app-floating-panel', [
    'width:\\s*min\\(1040px, calc\\(100% - 32px\\)\\)',
  ]);

  ruleIncludes('.baby-moment-panel.app-floating-panel', [
    'width:\\s*min\\(1080px, calc\\(100% - 32px\\)\\)',
  ]);

  ruleIncludes('.moment-gallery-grid', [
    'display:\\s*grid',
    'grid-template-columns:\\s*repeat\\(3, minmax\\(0, 1fr\\)\\)',
  ]);

  ruleIncludes('.growth-chart-shell', [
    'height:\\s*330px',
    'min-height:\\s*260px',
  ]);
});

test('tablet header compaction CSS remains in place', () => {
  const mediaStart = css.indexOf('@media (min-width: 681px) and (max-width: 1023px)');
  assert.notEqual(mediaStart, -1, 'Missing tablet-specific media query');
  const nextMedia = css.indexOf('@media (max-width: 680px)', mediaStart);
  assert.notEqual(nextMedia, -1, 'Tablet media query should be followed by the mobile media query');
  const block = compact(css.slice(mediaStart, nextMedia));
  assert.match(block, /\.top-bar \{ min-height:\s*148px; padding:\s*28px 20px 32px;/);
  assert.match(block, /\.day-label \{ font-size:\s*40px;/);
  assert.match(block, /\.home-hero \{ min-height:\s*clamp\(128px, 18dvh, 180px\);/);
});
