/* Smoke-тест KazGo в headless Chrome (puppeteer из kazakh-3d-game) */
const puppeteer = require('C:/Users/2022/kazakh-3d-game/node_modules/puppeteer');

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--window-size=420,800',
           '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    defaultViewport: { width: 420, height: 800 },
  });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  try {
    await page.goto('http://127.0.0.1:8412/', { waitUntil: 'networkidle2', timeout: 45000 }).catch(e => errors.push('NAV: ' + e.message));
    await page.waitForSelector('#start-overlay', { timeout: 10000 });
    console.log('START_OVERLAY_OK');

    await page.click('#btn-demo');
    await new Promise(r => setTimeout(r, 1500));

    const state = await page.evaluate(() => ({
      overlayHidden: document.getElementById('start-overlay').classList.contains('hidden'),
      joystickVisible: !document.getElementById('joystick').classList.contains('hidden'),
      playerSet: player.lat != null,
      itemsVisible: Object.keys(visible).length,
      markersOnMap: document.querySelectorAll('.item-marker').length,
      playerMarker: !!document.querySelector('.player-marker'),
    }));
    console.log('DEMO_STATE', JSON.stringify(state));
    if (!state.playerSet || state.itemsVisible === 0) throw new Error('нет игрока или предметов');
    if (!state.markersOnMap) throw new Error('нет маркеров на карте');
    if (!state.playerMarker) throw new Error('нет маркера игрока');

    // сбор: телепорт к ближайшему предмету и tryCollect
    const before = await page.evaluate(() => ({ total: save.total, xp: save.xp }));
    const collectRes = await page.evaluate(() => {
      let best = null;
      for (const [key, v] of Object.entries(visible)) {
        const d = haversine(player.lat, player.lng, v.lat, v.lng);
        if (!best || d < best.d) best = { key, v, d };
      }
      player.lat = best.v.lat; player.lng = best.v.lng;
      updatePlayerMarker();
      const id = best.v.item.id, rar = best.v.item.rarity;
      tryCollect(best.key);
      return { id, rar, d: Math.round(best.d) };
    });
    const after = await page.evaluate(() => ({ total: save.total, xp: save.xp }));
    console.log('COLLECT', JSON.stringify({ collectRes, before, after }));
    if (after.total !== before.total + 1) throw new Error('сбор не засчитался');
    if (after.xp <= before.xp) throw new Error('XP не добавлен');

    // сбор издалека должен отклониться
    const farCheck = await page.evaluate(() => {
      const keys = Object.keys(visible);
      if (!keys.length) return { skipped: true };
      player.lat += 0.01; player.lng += 0.01; // ~1 км
      updatePlayerMarker();
      const t0 = save.total;
      tryCollect(keys[0]);
      return { skipped: false, rejected: save.total === t0 };
    });
    console.log('FAR_CHECK', JSON.stringify(farCheck));
    if (!farCheck.skipped && !farCheck.rejected) throw new Error('сбор издалека не отклонился');

    // кодекс: 19 карточек, у собранной счётчик ×1
    const codex = await page.evaluate(() => {
      document.querySelector('#tabs button[data-tab="codex"]').click();
      const cards = document.querySelectorAll('.codex-card');
      const collected = document.querySelectorAll('.codex-card:not(.locked)').length;
      return { cards: cards.length, collected };
    });
    console.log('CODEX', JSON.stringify(codex));
    if (codex.cards !== 19) throw new Error('кодекс: ' + codex.cards + ' карточек');
    if (codex.collected !== 1) throw new Error('в кодексе не отмечен собранный предмет');

    // квесты
    const quests = await page.evaluate(() => {
      document.querySelector('#tabs button[data-tab="quests"]').click();
      return document.querySelectorAll('.quest').length;
    });
    if (quests !== 3) throw new Error('квестов: ' + quests);
    console.log('QUESTS_OK 3');

    // AR-режим: фейковая камера + сымитированный компас
    const ar = await page.evaluate(async () => {
      document.getElementById('btn-ar').click();
      await new Promise(r => setTimeout(r, 1800));
      const screen = document.getElementById('ar-screen');
      const video = document.getElementById('ar-video');
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 120, absolute: true, beta: 0, gamma: 0 }));
      await new Promise(r => setTimeout(r, 800));
      const near = document.querySelectorAll('.ar-item.near').length;
      return {
        hidden: screen.classList.contains('hidden'),
        videoReady: video.readyState >= 2,
        items: document.querySelectorAll('.ar-item').length,
        near,
        compass: document.getElementById('ar-compass').textContent,
      };
    });
    console.log('AR', JSON.stringify(ar));
    if (ar.hidden) throw new Error('AR-экран не открылся');
    if (!ar.videoReady) throw new Error('видео не запустилось');
    if (ar.items < 1) throw new Error('в AR нет предметов');
    if (!/°/.test(ar.compass)) throw new Error('компас не отрисован: ' + ar.compass);
    await page.screenshot({ path: 'C:/Users/2022/kazgo/_ar.png' });
    await page.evaluate(() => document.getElementById('btn-ar-close').click());
    await new Promise(r => setTimeout(r, 400));
    const arClosed = await page.evaluate(() => document.getElementById('ar-screen').classList.contains('hidden'));
    if (!arClosed) throw new Error('AR не закрылся');
    console.log('AR_OK');

    await page.screenshot({ path: 'C:/Users/2022/kazgo/_smoke.png' });

    const realErrors = errors.filter(e => !/net::|Failed to load resource|tile/i.test(e));
    console.log(realErrors.length ? 'CONSOLE_ERRORS:\n' + realErrors.join('\n') : 'NO_JS_ERRORS');
    await browser.close();
    console.log('SMOKE_OK');
  } catch (e) {
    await browser.close().catch(() => {});
    console.error('SMOKE_FAIL', e.message);
    process.exit(1);
  }
})();
