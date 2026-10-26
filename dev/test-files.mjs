// Unit tests for providers/files.js against this computer's real GNOME file index.
// Run from the project folder: gjs -m dev/test-files.mjs
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

const root = GLib.path_get_dirname(GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]));
const {findFiles, isRunnable} = await import(`file://${root}/eureka@shahriyar31.github.io/providers/files.js`);

let failed = 0;
const check = (ok, what) => {
    console.log(`${ok ? '  ok  ' : '  FAIL'}  ${what}`);
    if (!ok)
        failed++;
};
const search = q => new Promise(resolve => findFiles(q, null, resolve, 6, 3));
const mtime = path => Gio.File.new_for_path(path).query_info('time::modified', 0, null).get_modification_date_time().to_unix();

// folders: found by name, newest first, opened (not run)
const docs = await search('documents');
check(docs.some(r => r.kind === 'folder' && r.name === 'Documents'), '"documents" finds the Documents folder');
const folders = docs.filter(r => r.kind === 'folder');
check(folders.every((f, i) => i === 0 || mtime(folders[i - 1].path) >= mtime(f.path)), 'folders are newest first');
check(folders.every(f => !f.runnable), 'folders are never treated as programs');

// junk stays out
const all = [...docs, ...await search('config'), ...await search('index')];
check(all.every(r => !r.path.includes('/.') && !r.path.includes('/node_modules/') && !/\.(jar|so|pyc)$/.test(r.name)),
    'no hidden folders, node_modules or library files in results');
check(all.every(r => r.uri.startsWith('file://')), 'every result is a local file:// address');

// the "never run what it finds" rule
const desktop = Gio.File.new_for_path('/usr/share/applications').enumerate_children('standard::name', 0, null);
let launcher = null, info;
while (!launcher && (info = desktop.next_file(null)))
    launcher = info.get_name().endsWith('.desktop') ? `/usr/share/applications/${info.get_name()}` : null;
check(isRunnable(Gio.File.new_for_path('/usr/bin/true')), 'a program (/usr/bin/true) counts as runnable');
check(launcher && isRunnable(Gio.File.new_for_path(launcher)), 'a .desktop launcher counts as runnable');
check(!isRunnable(Gio.File.new_for_path(`${root}/README.md`)), 'a Markdown file is not runnable');
check(!isRunnable(Gio.File.new_for_path(`${root}/docs/dark.png`)), 'a picture is not runnable');

console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
if (failed)
    System.exit(1);
