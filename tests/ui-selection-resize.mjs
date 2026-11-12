import assert from 'node:assert/strict';
import { wavFixture } from './fixtures.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('../Wave Curves.html', import.meta.url).href);
  await page.waitForSelector('#app[data-ready="true"]');
  await page.getByRole('button', {name:'애니메이션 일시정지',exact:true}).click();
  const control = name => page.locator(`[data-control="${name}"]`);
  const action = name => page.locator(`[data-action="${name}"]`);
  const handle = edge => page.locator(`[data-edge="${edge}"]`);
  const waveform = page.locator('.waveform');
  await control('file').setInputFiles({name:'resize.wav',mimeType:'audio/wav',buffer:wavFixture({encoding:3,bits:32,sampleRate:1000,frames:10000,value:i=>Math.cos(2*Math.PI*7*i/1000)})});
  await page.waitForFunction(()=>document.querySelector('.file-name').textContent==='resize.wav');
  const setNumber = async (name,value) => {await control(name).fill(String(value));await control(name).press('Tab');};
  const selected = async () => {
    const start = Math.round(Number(await control('start').inputValue())*1000);
    const end = Math.round(Number(await control('end').inputValue())*1000);
    return {start,end,length:end-start};
  };
  const setup = async () => {await setNumber('start',2);await setNumber('end',4);await action('wave-fit').click();};
  const dragEdge = async (edge,seconds,{cancel=false,checkPreview=true}={}) => {
    await handle(edge).scrollIntoViewIfNeeded();
    const bounds = await handle(edge).boundingBox();
    const waveBounds = await waveform.boundingBox();
    const length = Number(await waveform.getAttribute('data-view-length'));
    const pixels = seconds*1000/length*waveBounds.width;
    const oldMax = await control('count').getAttribute('max');
    const coefficients = await page.locator('.coefficients').innerHTML();
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
    await page.mouse.down();
    await page.mouse.move(bounds.x+bounds.width/2+pixels,bounds.y+bounds.height/2,{steps:4});
    if(checkPreview) {
      assert.equal(await control('count').getAttribute('max'),oldMax,'FFT must wait for release');
      assert.equal(await page.locator('.coefficients').innerHTML(),coefficients);
      assert.match(await page.locator('.window-info').textContent(),/놓으면 적용/);
    }
    if(cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
    return selected();
  };
  const near = (actual,expected) => assert.ok(Math.abs(actual-expected)<=10,`${actual} != ${expected}`);
  await setup();
  let s=await dragEdge('end',1);
  assert.equal(s.start,2000);near(s.end,5000);
  assert.equal(Number(await control('count').getAttribute('max')),Math.floor(s.length/2)+1);
  const fixedEnd=s.end;
  s=await dragEdge('start',1);
  near(s.start,3000);assert.equal(s.end,fixedEnd);
  const beforeCancel=await selected();
  await dragEdge('end',1,{cancel:true});
  assert.deepEqual(await selected(),beforeCancel);
  await setup();
  await action('wave-selection').click();
  const viewBefore=[await waveform.getAttribute('data-view-start'),await waveform.getAttribute('data-view-length')];
  s=await dragEdge('end',0.25);
  assert.equal(s.start,2000);near(s.end,4250);
  assert.deepEqual([await waveform.getAttribute('data-view-start'),await waveform.getAttribute('data-view-length')],viewBefore);
  await action('wave-fit').click();
  s=await dragEdge('start',-100);
  assert.equal(s.start,0);
  s=await dragEdge('end',100);
  assert.equal(s.end,10000);
  await setup();
  s=await dragEdge('start',100);
  assert.equal(s.length,1);
  assert.equal(s.end,4000);
  assert.equal(await control('count').getAttribute('max'),'1');
  const left=await handle('start').boundingBox();
  const right=await handle('end').boundingBox();
  assert.ok(Math.abs(left.y-right.y)>44,'tiny selections must keep both grips reachable');
  await handle('start').press('ArrowLeft');
  assert.equal((await selected()).length,2);
  await handle('end').press('ArrowRight');
  assert.equal((await selected()).length,3);

  // Canvas-edge dragging works even away from the visible grip.
  await setup();
  await waveform.scrollIntoViewIfNeeded();
  let bounds=await waveform.boundingBox();
  await page.mouse.move(bounds.x+bounds.width*0.4,bounds.y+15);
  await page.mouse.down();
  await page.mouse.move(bounds.x+bounds.width*0.5,bounds.y+15);
  await page.mouse.up();
  s=await selected();assert.equal(s.start,2000);near(s.end,5000);
  // Interior dragging keeps the length.
  const oldLength=s.length;
  await page.mouse.move(bounds.x+bounds.width*0.35,bounds.y+bounds.height/2);
  await page.mouse.down();
  await page.mouse.move(bounds.x+bounds.width*0.45,bounds.y+bounds.height/2);
  await page.mouse.up();
  assert.equal((await selected()).length,oldLength);

  // Real touch input on a mobile viewport.
  await setup();
  await page.setViewportSize({width:390,height:844});
  await handle('end').scrollIntoViewIfNeeded();
  bounds=await handle('end').boundingBox();
  const waveBounds=await waveform.boundingBox();
  const x=bounds.x+bounds.width/2;
  const y=bounds.y+bounds.height/2;
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+waveBounds.width*0.1,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  s=await selected();assert.equal(s.start,2000);near(s.end,5000);
  await cdp.detach();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'.verification/selection-resize-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: both selection edges resize, opposite endpoint fixed, preview commits once on release, Escape cancels, zoom coordinates, sample/file bounds, tiny handles, keyboard, interior movement and mobile touch.');
} finally {await browser.close();}
