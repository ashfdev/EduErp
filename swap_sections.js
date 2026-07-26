const fs = require('fs');
const path = 'apps/website/src/app/[locale]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const bannerStart = content.indexOf('{/* ── Admission Banner ── */}');
const aboutStart = content.indexOf('{/* ── About Institution + Notice Board ── */}');
const govStart = content.indexOf('{/* ── Governing Body ── */}');

if (bannerStart !== -1 && aboutStart !== -1 && govStart !== -1) {
    const bannerCode = content.substring(bannerStart, aboutStart);
    const aboutCode = content.substring(aboutStart, govStart);
    
    // Construct new content
    const beforeBanner = content.substring(0, bannerStart);
    const afterGov = content.substring(govStart);
    
    const newContent = beforeBanner + aboutCode + bannerCode + afterGov;
    
    fs.writeFileSync(path, newContent, 'utf8');
    console.log('Swapped successfully');
} else {
    console.log('Could not find indices');
}
