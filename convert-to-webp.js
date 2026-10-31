// Usage:
//   Dry run (report only, nothing is written):
//     node convert-to-webp.js /full/path/to/laravel-project/public --dry-run
//   Real run:
//     node convert-to-webp.js /full/path/to/laravel-project/public
//
// (if no path is given, it uses ./public in the current folder)
// Install first: npm install sharp --save-dev
// node convert-to-webp.js ../public
//npm init -y    npm install sharp

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const pathArg = args.find((a) => !a.startsWith('--'));

// Folder to scan (Laravel public folder)
const PUBLIC_DIR = path.resolve(pathArg || path.join(process.cwd(), 'public'));

if (!fs.existsSync(PUBLIC_DIR)) {
  console.error('Folder not found:', PUBLIC_DIR);
  console.error('Usage: node convert-to-webp.js /path/to/your-laravel-project/public [--dry-run]');
  process.exit(1);
}

// File extensions to convert
const EXTENSIONS = ['.png', '.jpg', '.jpeg'];

// Skip any file whose name contains one of these words (case-insensitive)
const SKIP_NAMES = ['favicon', 'icon'];

// Folders to ignore completely
const SKIP_DIRS = ['vendor', 'node_modules', 'build'];

// Delete the original file after conversion? (set true if you want)
const DELETE_ORIGINAL = true;

const WEBP_QUALITY = 99;

const rel = (p) => path.relative(PUBLIC_DIR, p);
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

const report = { convert: [], skipped: [], exists: [], failed: [], origBytes: 0, webpBytes: 0 };

async function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.includes(entry.name)) await walk(fullPath);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!EXTENSIONS.includes(ext)) continue;

    const lowerName = entry.name.toLowerCase();
    if (SKIP_NAMES.some((word) => lowerName.includes(word))) {
      report.skipped.push(rel(fullPath));
      continue;
    }

    const output = fullPath.replace(/\.(png|jpe?g)$/i, '.webp');

    if (fs.existsSync(output)) {
      report.exists.push(rel(fullPath));
      continue;
    }

    try {
      const origSize = fs.statSync(fullPath).size;
      const image = sharp(fullPath).webp({ quality: WEBP_QUALITY });
      let webpSize;

      if (DRY_RUN) {
        // Convert in memory only, to estimate the new size. Nothing is saved.
        webpSize = (await image.toBuffer()).length;
      } else {
        await image.toFile(output);
        webpSize = fs.statSync(output).size;
        if (DELETE_ORIGINAL) fs.unlinkSync(fullPath);
      }

      report.origBytes += origSize;
      report.webpBytes += webpSize;
      report.convert.push({ file: rel(fullPath), origSize, webpSize });
    } catch (err) {
      report.failed.push(`${rel(fullPath)} (${err.message})`);
    }
  }
}

walk(PUBLIC_DIR).then(() => {
  console.log(`\n=== ${DRY_RUN ? 'DRY RUN REPORT (nothing was written)' : 'CONVERSION REPORT'} ===`);
  console.log('Folder:', PUBLIC_DIR, '\n');

  console.log(`${DRY_RUN ? 'Will convert' : 'Converted'} (${report.convert.length}):`);
  report.convert.forEach((c) =>
    console.log(`  ${c.file}  ${kb(c.origSize)} -> ${kb(c.webpSize)}`)
  );

  console.log(`\nSkipped, protected names (${report.skipped.length}):`);
  report.skipped.forEach((f) => console.log('  ' + f));

  console.log(`\nSkipped, .webp already exists (${report.exists.length}):`);
  report.exists.forEach((f) => console.log('  ' + f));

  console.log(`\nFailed (${report.failed.length}):`);
  report.failed.forEach((f) => console.log('  ' + f));

  const saved = report.origBytes - report.webpBytes;
  const pct = report.origBytes ? ((saved / report.origBytes) * 100).toFixed(1) : '0';
  console.log(
    `\nTotal: ${kb(report.origBytes)} -> ${kb(report.webpBytes)}  (${DRY_RUN ? 'estimated saving' : 'saved'} ${kb(saved)}, ${pct}%)`
  );

  if (DRY_RUN) console.log('\nLooks good? Run again without --dry-run to convert for real.');
});