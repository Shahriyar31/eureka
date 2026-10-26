// SPDX-License-Identifier: GPL-2.0-or-later
// File and folder search through GNOME's file index (localsearch, or tracker3 on older systems).
// Pure data, no GNOME Shell imports, so it can be unit-tested with plain gjs (dev/test-files.mjs).
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const HOME = GLib.get_home_dir();

const FILE_ICONS = {pdf: 'x-office-document-symbolic', md: 'text-x-generic-symbolic', txt: 'text-x-generic-symbolic',
    png: 'image-x-generic-symbolic', jpg: 'image-x-generic-symbolic', jpeg: 'image-x-generic-symbolic',
    mp4: 'video-x-generic-symbolic', mp3: 'audio-x-generic-symbolic', zip: 'package-x-generic-symbolic',
    docx: 'x-office-document-symbolic', xlsx: 'x-office-spreadsheet-symbolic', pptx: 'x-office-presentation-symbolic',
    py: 'text-x-script-symbolic', js: 'text-x-script-symbolic', ipynb: 'text-x-script-symbolic'};
const FILE_SKIP = ['/.', '/node_modules/', '/site-packages/', '/dist-packages/', '/lib/python', '/__pycache__/',
    '/build/', '/miniforge3/', '/anaconda3/', '/snap/', '/Android/Sdk/', '/go/pkg/', '/target/', '/vendor/', '/lib/',
    '/plugins/', '/libexec/'];
const isJunk = name => /^[A-Z0-9_]+$/.test(name) ||
    /\.(lock|pid|tmp|part|pyi|jar|so|dll|dylib|class|o|a|pyc|node|wasm)(\.\d+)*$/i.test(name);

const RUNNABLE_TYPES = ['application/x-executable', 'application/x-sharedlib', 'application/x-shellscript',
    'application/x-desktop', 'application/x-ms-dos-executable', 'application/x-msdownload', 'text/x-python',
    'application/x-perl', 'application/x-ruby', 'application/vnd.appimage', 'application/x-sh'];

/** True for programs, scripts and launchers: Eureka shows these in Files and never runs them. */
export function isRunnable(file) {
    try {
        const info = file.query_info('standard::content-type,access::can-execute', Gio.FileQueryInfoFlags.NONE, null);
        const type = info.get_content_type() ?? '';
        return info.get_attribute_boolean('access::can-execute') || RUNNABLE_TYPES.some(t => Gio.content_type_is_a(type, t)) ||
            /\.(desktop|sh|run|appimage|exe|bat|py|pl|rb)$/i.test(file.get_basename());
    } catch {
        return true;   // unknown: be safe, only reveal
    }
}

let indexer;   // localsearch (GNOME 47+) or tracker3 (older), found once
function indexerBinary() {
    if (indexer === undefined)
        indexer = GLib.find_program_in_path('localsearch') ?? GLib.find_program_in_path('tracker3');
    return indexer;
}

/**
 * Files and folders from GNOME's own index (names and content), as plain data.
 * Calls onDone([{kind: 'folder'|'file', name, folder, uri, path, iconName, runnable}]) unless cancelled.
 */
export function findFiles(query, cancellable, onDone, limit = 6, folderLimit = 3) {
    const bin = indexerBinary();
    const terms = query.split(/\s+/).filter(t => t.length > 1);
    if (!bin || query.length < 3 || !terms.length) {
        onDone([]);
        return;
    }
    let proc;
    try {
        proc = Gio.Subprocess.new([bin, 'search', '--files', '--folders', '--limit', '60', '--', ...terms],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
    } catch {
        onDone([]);
        return;
    }
    proc.communicate_utf8_async(null, cancellable, (p, res) => {
        let out = '';
        try {
            [, out] = p.communicate_utf8_finish(res);
        } catch {
            return;   // cancelled: a newer query is running
        }
        const q = query.toLowerCase();
        const items = (out || '').split('\n').map(l => l.trim()).filter(l => l.startsWith('file://'))
            .map(uri => ({uri, file: Gio.File.new_for_uri(uri)}))
            .filter(({uri}) => !FILE_SKIP.some(s => decodeURIComponent(uri).includes(s)))
            .map(item => ({...item, type: item.file.query_file_type(Gio.FileQueryInfoFlags.NONE, null)}))
            .filter(({file, type}) => !isJunk(file.get_basename()) &&
                (type === Gio.FileType.REGULAR || type === Gio.FileType.DIRECTORY))
            .filter((item, i, all) => all.findIndex(o => o.file.get_path() === item.file.get_path()) === i);
        const nameHit = ({file}) => file.get_basename().toLowerCase().includes(q);
        items.sort((a, b) => Number(!nameHit(a)) - Number(!nameHit(b)));
        // folders only when their name matches; content matches do not apply to folders
        const modified = ({file}) => {
            try {
                return file.query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null).get_modification_date_time()
                    ?.to_unix() ?? 0;
            } catch {
                return 0;
            }
        };
        // most recently changed first, so the folder you are working in wins (Semester_7 before Semester_4)
        const folders = items.filter(i => i.type === Gio.FileType.DIRECTORY && nameHit(i))
            .map(i => ({...i, mtime: modified(i)})).sort((a, b) => b.mtime - a.mtime).slice(0, folderLimit)
            .map(({uri, file}) => ({
                kind: 'folder', name: file.get_basename(), uri, path: file.get_path(), runnable: false,
                folder: (file.get_parent()?.get_path() ?? '').replace(HOME, '~'), iconName: 'folder-symbolic',
            }));
        const regular = items.filter(i => i.type === Gio.FileType.REGULAR)
            .filter((item, i, all) => all.findIndex(o => o.file.get_basename() === item.file.get_basename()) === i);
        onDone([...folders, ...regular.slice(0, limit).map(({uri, file}) => {
            const name = file.get_basename();
            const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
            return {
                kind: 'file', name, uri, path: file.get_path(), runnable: isRunnable(file),
                folder: (file.get_parent()?.get_path() ?? '').replace(HOME, '~'),
                iconName: FILE_ICONS[ext] ?? 'text-x-generic-symbolic',
            };
        })]);
    });
}
