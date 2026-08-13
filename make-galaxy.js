const fs = require('fs');

const W = 1920, H = 1080;
let stars = '';
for (let i = 0; i < 420; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = (Math.random() * 1.6 + 0.3).toFixed(1);
    const o = (Math.random() * 0.9 + 0.1).toFixed(2);
    const hue = Math.random();
    let fill = '#ffffff';
    if (hue < 0.12) fill = '#9bb8ff';
    else if (hue < 0.22) fill = '#ffd9a8';
    stars += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${fill}" opacity="${o}"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="nebula1" cx="30%" cy="25%" r="70%">
      <stop offset="0%" stop-color="#3b1d6e" stop-opacity="0.55"/>
      <stop offset="45%" stop-color="#1a1040" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#050510" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="nebula2" cx="75%" cy="70%" r="65%">
      <stop offset="0%" stop-color="#123a63" stop-opacity="0.5"/>
      <stop offset="50%" stop-color="#0c1c3a" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#050510" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="nebula3" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#a83a6b" stop-opacity="0.22"/>
      <stop offset="60%" stop-color="#3a1a4a" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="#050510" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="disk" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff7d6"/>
      <stop offset="18%" stop-color="#ffe9a3"/>
      <stop offset="38%" stop-color="#ff9a3d"/>
      <stop offset="60%" stop-color="#c05dff"/>
      <stop offset="82%" stop-color="#4d7bff"/>
      <stop offset="100%" stop-color="#12204a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffca6b" stop-opacity="0.9"/>
      <stop offset="40%" stop-color="#c05dff" stop-opacity="0.45"/>
      <stop offset="75%" stop-color="#4d7bff" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="#04040c"/>
  <rect width="${W}" height="${H}" fill="url(#nebula1)"/>
  <rect width="${W}" height="${H}" fill="url(#nebula2)"/>
  <rect width="${W}" height="${H}" fill="url(#nebula3)"/>

  <g transform="translate(1350,360)">
    <ellipse rx="290" ry="290" fill="url(#glow)"/>
    <g transform="rotate(-18)">
      <ellipse cx="0" cy="0" rx="430" ry="150" fill="url(#disk)" opacity="0.95"/>
      <ellipse cx="0" cy="0" rx="430" ry="150" fill="none" stroke="#ffe9a3" stroke-opacity="0.6" stroke-width="26"/>
      <ellipse cx="0" cy="0" rx="250" ry="150" fill="#000"/>
      <ellipse cx="0" cy="0" rx="250" ry="150" fill="none" stroke="#7a2e9e" stroke-opacity="0.5" stroke-width="10"/>
    </g>
  </g>

  <g transform="translate(430,820)">
    <ellipse rx="130" ry="130" fill="url(#glow)" opacity="0.8"/>
    <g transform="rotate(12)">
      <ellipse cx="0" cy="0" rx="200" ry="70" fill="url(#disk)" opacity="0.8"/>
      <ellipse cx="0" cy="0" rx="110" ry="70" fill="#000"/>
    </g>
  </g>

  <g>${stars}</g>
</svg>`;

fs.writeFileSync(__dirname + '/galaxy.svg', svg);
console.log('galaxy.svg written:', svg.length, 'bytes');
