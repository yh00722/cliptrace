// generate-png.js - Convert SVG icons to PNG format
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];

async function generatePNGs() {
    for (const size of sizes) {
        const svgPath = path.join(__dirname, `icon-${size}.svg`);
        const pngPath = path.join(__dirname, `icon-${size}.png`);

        if (fs.existsSync(svgPath)) {
            try {
                await sharp(svgPath)
                    .resize(size, size)
                    .png()
                    .toFile(pngPath);
                console.log(`✓ Generated icon-${size}.png`);
            } catch (err) {
                console.error(`✗ Failed to generate icon-${size}.png:`, err.message);
            }
        } else {
            console.warn(`⚠ SVG file not found: icon-${size}.svg`);
        }
    }
}

generatePNGs().then(() => {
    console.log('\nDone! PNG icons generated.');
}).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
