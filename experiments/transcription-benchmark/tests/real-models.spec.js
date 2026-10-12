import {test,expect} from '@playwright/test';
// Deliberately separate from simulated UI tests. CI installs verified real weights and synthetic speech.
if(process.env.REAL_MODELS==='1'){
 for(const seconds of [15,30,60])test(`REAL wasm q8: both models transcribe the same ${seconds}s completed clip offline`,async({page,context})=>{
  test.setTimeout(300000);const errors=[],network=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>network.push({url:r.url(),method:r.method()}));
  await page.goto('./');await page.locator('#file').setInputFiles(`public/fixtures/${seconds}.wav`);
  for(const model of ['whisper','moonshine']){
   await context.setOffline(false);await page.locator('#model').selectOption(model);page.once('dialog',d=>d.accept());await page.locator('#load').click();
   await expect(page.locator('#model-status')).toContainText('ready',{timeout:120000});
   await context.setOffline(true);await page.locator('#run').click();
   await expect(page.locator('.transcript').last()).toContainText(/garden|flowers|book|birds|friend/i,{timeout:180000});
  }
  await expect(page.locator('.result')).toHaveCount(2);const titles=await page.locator('.result h3').allTextContents();expect(titles[0].split('clip ')[1]).toBe(titles[1].split('clip ')[1]);
  await page.locator('#audio').evaluate(async a=>{await a.play();a.pause();});expect(errors).toEqual([]);
  expect(network.filter(r=>r.method!=='GET'||(!r.url.startsWith('blob:')&&new URL(r.url).hostname!=='127.0.0.1'))).toEqual([]);
 });
}
