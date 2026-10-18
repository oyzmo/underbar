// Renders icon candidates side by side at 512 and 48 for an eyeball check.
// Developer-only; the shipped pipeline is assets/render-icon.js.
//
// Round 3. Rounds 1-2 settled the composition: a dark bar (GNOME's own is a
// dark strip) running in from the left and disappearing behind a cream window
// snapped to the right edge. One long unambiguous run of bar beats two
// symmetrical stubs, which read as a rail with a towel on it.
// What is left is proportion, and whether an indicator dot earns its place.
const {chromium} = require('playwright');
const path = require('path');

const TILE = `<defs><linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#8FB089"/><stop offset="1" stop-color="#6E8C6A"/>
</linearGradient></defs>
<rect width="512" height="512" rx="114" fill="url(#tile)"/>`;

const CREAM = '#F4E7D3';
const COCOA = '#4A3428';
const BAR = `<rect x="40" y="104" width="432" height="56" rx="28" fill="${COCOA}"/>`;

const wrap = body =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${TILE}${body}</svg>`;

// I1: round 2's winner, unchanged.
const I1 = wrap(`${BAR}
  <rect x="232" y="48" width="240" height="330" rx="32" fill="${CREAM}"/>`);

// I2: the window taller and a touch wider, so it reads as a window holding the
// right of the screen rather than a card floating in the top corner.
const I2 = wrap(`${BAR}
  <rect x="224" y="44" width="248" height="396" rx="34" fill="${CREAM}"/>`);

// I3: I2 plus a cream indicator dot at the bar's left end -- a clock, the thing
// that makes a dark strip legible as a top bar rather than a line.
const I3 = wrap(`${BAR}
  <circle cx="106" cy="132" r="17" fill="${CREAM}"/>
  <rect x="224" y="44" width="248" height="396" rx="34" fill="${CREAM}"/>`);

const variants = {I1, I2, I3};

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    for (const [name, svg] of Object.entries(variants)) {
        for (const size of [512, 48]) {
            await page.setViewportSize({width: size, height: size});
            await page.setContent(
                `<body style="margin:0">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body>`);
            await page.screenshot({
                path: path.join(__dirname, `variant-${name}-${size}.png`),
                omitBackground: true,
            });
        }
    }
    await browser.close();
    console.log('rendered ' + Object.keys(variants).join(', '));
})();
