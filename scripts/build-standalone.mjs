import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const [template, styles, fourier, wav, app] = await Promise.all([
  read('index.html'), read('src/style.css'), read('src/fourier.js'),
  read('src/wav.js'), read('src/app.js')
]);

// These three local modules have no third-party or dynamic imports.
const code = [fourier, wav, app]
  .map(source => source
    .replace(/^import \{[^\n]+\} from '\.\/(fourier|wav)\.js';\r?\n/gm, '')
    .replace(/^export function /gm, 'function '))
  .join('\n\n');
if (/^\s*(import|export)\s/m.test(code)) {
  throw new Error('새 모듈 의존성을 독립 HTML 빌드에 추가해야 합니다.');
}
const script = `${code}\nmountWaveCurves(document.querySelector('#app'));`
  .replace(/<\/script/gi, '<\\/script');
const html = template
  .replace('<link rel="stylesheet" href="./src/style.css">', () => `<style>\n${styles}\n</style>`)
  .replace(/<script type="module">[\s\S]*?<\/script>/, () => `<script type="module">\n${script}\n</script>`);
await writeFile(new URL('Wave Curves.html', root), html, 'utf8');
console.log('Created Wave Curves.html');
