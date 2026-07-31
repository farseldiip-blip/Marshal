import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const BASE = 'http://localhost:8090';

const SECTIONS = ['dashboard', 'bookings', 'rooms', 'customers', 'reviews', 'gallery', 'menu', 'settings'];
const WIDTHS = [1920, 1440, 1366, 1280, 1024, 768, 480, 375];

// CSS property pairs: [physical, logical] to check if logical is being used
const CHECKS = [
  ['left', 'inset-inline-start'],
  ['right', 'inset-inline-end'],
  ['margin-left', 'margin-inline-start'],
  ['margin-right', 'margin-inline-end'],
  ['padding-left', 'padding-inline-start'],
  ['padding-right', 'padding-inline-end'],
  ['border-left', 'border-inline-start'],
  ['border-right', 'border-inline-end'],
  ['text-align:left', 'text-align:start'],
  ['text-align:right', 'text-align:end'],
  ['transform:translateX', ''], // presence check
];

const SELECTORS = {
  shell: ['.dash', '.dash-side', '.dash-main', '.dash-head', '.dash-head__logo', '.dash-head__actions'],
  sidebar: ['.dash-nav', '.dash-nav a', '.dash-nav .dash-nav__label', '.dash-nav__logout'],
  dashboard: ['.dash-stats', '.dash-stat', '.dash-occ', '.dash-chart-wrap', '.dash-quick'],
  bookings: ['.bk-list', '.bk-row', '.bk-row__guest', '.bk-row__guest-name', '.bk-row__guest-email', '.bk-row__total', '.bk-row__actions', '.bk-more-menu', '.bk-pagination'],
  rooms: ['.rm-list', '.rm-card', '.rm-card__info', '.rm-card__price', '.rm-card__actions'],
  customers: ['.cg-list', '.cg-row', '.cg-avatar', '.cg-info', '.cg-bookings', '.cg-spent'],
  reviews: ['.rv-list', '.rv-card', '.rv-card__header', '.rv-card__body', '.rv-card__rating'],
  gallery: ['.gl-grid', '.gl-item', '.gl-item__overlay'],
  menu: ['.mn-grid', '.mn-card', '.mn-card__header', '.mn-card__body', '.mn-card__price'],
  settings: ['.st-form', '.st-field', '.st-field label', '.st-input', '.st-btn', '.st-card', '.st-card__header', '.st-card__body'],
  modals: ['.modal', '.modal-content', '.modal-header', '.modal-body', '.modal-close'],
  toast: ['.toast-container', '.toast'],
};

async function captureComputedStyles(page, section, sel, ctx) {
  const results = [];
  for (const s of sel) {
    const els = await page.$$(s);
    if (els.length === 0) {
      results.push({ selector: s, count: 0, styles: null });
      continue;
    }
    for (let i = 0; i < Math.min(els.length, 3); i++) {
      const el = els[i];
      const styles = await el.evaluate(el => {
        const cs = getComputedStyle(el);
        return {
          direction: cs.direction,
          textAlign: cs.textAlign,
          left: cs.left,
          right: cs.right,
          top: cs.top,
          bottom: cs.bottom,
          marginInlineStart: cs.marginInlineStart,
          marginInlineEnd: cs.marginInlineEnd,
          paddingInlineStart: cs.paddingInlineStart,
          paddingInlineEnd: cs.paddingInlineEnd,
          borderInlineStartWidth: cs.borderInlineStartWidth,
          borderInlineEndWidth: cs.borderInlineEndWidth,
          borderInlineStartColor: cs.borderInlineStartColor,
          borderInlineEndColor: cs.borderInlineEndColor,
          justifyContent: cs.justifyContent,
          alignItems: cs.alignItems,
          flexDirection: cs.flexDirection,
          gridTemplateColumns: cs.gridTemplateColumns,
          transform: cs.transform,
          translate: cs.translate,
          insetInlineStart: cs.insetInlineStart,
          insetInlineEnd: cs.insetInlineEnd,
          offsetWidth: el.offsetWidth,
          offsetHeight: el.offsetHeight,
          scrollWidth: el.scrollWidth,
          scrollHeight: el.scrollHeight,
          innerText: (el.innerText || '').substring(0, 60),
        };
      });
      results.push({ selector: s, index: i, styles, count: els.length });
    }
  }
  return { section, context: ctx, results };
}

async function auditPage(page, lang, dir, width) {
  const ctx = `${lang}-${width}`;
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${BASE}/admin.html?lang=${lang}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Verify lang/dir
  const htmlDir = await page.evaluate(() => document.documentElement.dir);
  const htmlLang = await page.evaluate(() => document.documentElement.lang);
  if (htmlDir !== dir || !htmlLang.startsWith(lang)) {
    console.log(`  WARN: expected dir=${dir}, lang=${lang}, got dir=${htmlDir}, lang=${htmlLang}`);
  }

  // Screenshot
  await page.screenshot({ path: path.join(OUT, `${ctx}.png`), fullPage: true });

  const allResults = [];
  for (const [section, sels] of Object.entries(SELECTORS)) {
    const r = await captureComputedStyles(page, section, sels, ctx);
    allResults.push(r);
  }
  return allResults;
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  const allData = [];

  const langs = [
    { lang: 'en', dir: 'ltr' },
    { lang: 'ar', dir: 'rtl' },
  ];

  for (const { lang, dir } of langs) {
    const page = await browser.newPage();
    for (const w of WIDTHS) {
      console.log(`Auditing ${lang} at ${w}px...`);
      const data = await auditPage(page, lang, dir, w);
      allData.push(data);
    }
    await page.close();
  }

  await browser.close();

  // Write all data as JSON
  fs.writeFileSync(path.join(OUT, 'audit-data.json'), JSON.stringify(allData, null, 2));

  // Generate a summary report
  let report = '# RTL Audit Report\n\n';
  report += `Generated: ${new Date().toISOString()}\n\n`;

  // Check for issues
  for (const dataSet of allData) {
    for (const section of dataSet) {
      const { section: sname, context, results } = section;
      const isRTL = context.startsWith('ar');
      for (const r of results) {
        if (!r.styles) continue;
        const s = r.styles;
        // Check direction
        if (isRTL && s.direction !== 'rtl') {
          report += `ISSUE: [${context}] ${sname} > ${r.selector}[${r.index}]: dir=${s.direction} (expected rtl)\n`;
        }
        if (!isRTL && s.direction !== 'ltr') {
          report += `ISSUE: [${context}] ${sname} > ${r.selector}[${r.index}]: dir=${s.direction} (expected ltr)\n`;
        }
        // Check textAlign
        if (isRTL && s.textAlign === 'left') {
          report += `ISSUE: [${context}] ${sname} > ${r.selector}[${r.index}]: text-align=left (use end)\n`;
        }
        if (!isRTL && s.textAlign === 'right') {
          report += `ISSUE: [${context}] ${sname} > ${r.selector}[${r.index}]: text-align=right (use start)\n`;
        }
        // Check inset physical left/right
        if (s.left !== 'auto' && s.left !== '0px') {
          report += `PHYSICAL: [${context}] ${sname} > ${r.selector}[${r.index}]: left=${s.left} (use inset-inline-start)\n`;
        }
        if (s.right !== 'auto' && s.right !== '0px') {
          report += `PHYSICAL: [${context}] ${sname} > ${r.selector}[${r.index}]: right=${s.right} (use inset-inline-end)\n`;
        }
      }
    }
  }

  report += '\n## Summary\n';
  report += `Total LTR screenshots: ${WIDTHS.length}\n`;
  report += `Total RTL screenshots: ${WIDTHS.length}\n\n`;
  report += 'See screenshots/ directory for visual comparison.';

  fs.writeFileSync(path.join(OUT, 'audit-report.md'), report);
  console.log(`Report written to ${OUT}/audit-report.md`);
  console.log(`Data written to ${OUT}/audit-data.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
