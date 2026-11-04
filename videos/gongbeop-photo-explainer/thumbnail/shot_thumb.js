const {chromium} = require('playwright');
(async () => {
  const dir = process.argv[2];
  const b = await chromium.launch();
  const p = await b.newPage({viewport: {width: 1300, height: 2700}});
  await p.goto('file://' + dir + '/thumb.html');
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  await (await p.$('#h')).screenshot({path: dir + '/thumb_16x9.png'});
  await (await p.$('#v')).screenshot({path: dir + '/thumb_9x16.png'});
  await b.close();
})();
