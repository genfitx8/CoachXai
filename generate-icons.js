const sharp = require('./node_modules/sharp');
const fs = require('fs');

// More accurate SVG matching the CX logo:
// Dark rounded background, white bold C on left, gold X on right with swoosh effect
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f0c040"/>
      <stop offset="100%" stop-color="#c8900a"/>
    </linearGradient>
    <clipPath id="bg">
      <rect width="512" height="512" rx="88" ry="88"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="512" height="512" rx="88" ry="88" fill="#0d0d14"/>

  <!-- White C letter -->
  <text x="40" y="355"
    font-family="Arial Black, Helvetica Neue, sans-serif"
    font-size="290"
    font-weight="900"
    fill="white"
    clip-path="url(#bg)">C</text>

  <!-- Gold X (two crossing lines) -->
  <!-- top-left to bottom-right -->
  <line x1="245" y1="95" x2="455" y2="415"
    stroke="url(#goldGrad)" stroke-width="60" stroke-linecap="round"/>
  <!-- top-right to bottom-left -->
  <line x1="455" y1="95" x2="245" y2="415"
    stroke="url(#goldGrad)" stroke-width="60" stroke-linecap="round"/>
</svg>`;

async function generate() {
  const buf = Buffer.from(svg);

  // icon-512.png
  await sharp(buf).resize(512, 512).png().toFile('/home/runner/work/CoachXai/CoachXai/public/icons/icon-512.png');
  console.log('icon-512.png done');

  // icon-192.png
  await sharp(buf).resize(192, 192).png().toFile('/home/runner/work/CoachXai/CoachXai/public/icons/icon-192.png');
  console.log('icon-192.png done');

  // apple-touch-icon.png (180x180)
  await sharp(buf).resize(180, 180).png().toFile('/home/runner/work/CoachXai/CoachXai/public/icons/apple-touch-icon.png');
  console.log('apple-touch-icon.png done');

  // Also write the SVG files
  fs.writeFileSync('/home/runner/work/CoachXai/CoachXai/public/icons/icon-512.svg', svg);
  fs.writeFileSync('/home/runner/work/CoachXai/CoachXai/public/icons/icon-192.svg', svg);
  console.log('SVG files done');
}

generate().catch(console.error);
