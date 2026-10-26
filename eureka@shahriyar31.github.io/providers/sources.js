// SPDX-License-Identifier: GPL-2.0-or-later
// Search sources. Synchronous ones return result lists; the file index is asynchronous.
// A result: {section, title, subtitle, app | iconName, activate(), reveal()?}
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {calculate} from './calculator.js';
import {convert} from './units.js';
import {findFiles} from './files.js';


function launchUri(uri) {
    Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
}

function revealInFiles(uri) {
    // org.freedesktop.FileManager1 is implemented by Files (Nautilus) and most other file managers.
    Gio.DBus.session.call('org.freedesktop.FileManager1', '/org/freedesktop/FileManager1',
        'org.freedesktop.FileManager1', 'ShowItems', new GLib.Variant('(ass)', [[uri], '']),
        null, Gio.DBusCallFlags.NONE, -1, null, null);
}

function spawn(argv) {
    try {
        Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
    } catch (e) {
        console.log(`Eureka: ${e}`);
    }
}

export function apps(query, limit = 5) {
    const appSys = Shell.AppSystem.get_default();
    const names = new Set();
    return Shell.AppSystem.search(query).flat()
        .map(id => appSys.lookup_app(id)).filter(Boolean)
        .filter(app => !names.has(app.get_name()) && names.add(app.get_name()))   // one row per app name
        .slice(0, limit)
        .map(app => ({
            section: 'Applications', title: app.get_name(),
            subtitle: app.get_description() || '', app,
            activate: () => app.activate(),
        }));
}

export function windows(query, limit = 3) {
    const q = query.toLowerCase();
    const tracker = Shell.WindowTracker.get_default();
    return global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null)
        .filter(w => {
            const app = tracker.get_window_app(w);
            return (w.get_title() || '').toLowerCase().includes(q) || (app?.get_name() || '').toLowerCase().includes(q);
        })
        .slice(0, limit)
        .map(w => {
            const app = tracker.get_window_app(w);
            return {
                section: 'Open windows', title: w.get_title() || app?.get_name() || 'Window',
                subtitle: app ? `${app.get_name()} · ${_('switch to window')}` : _('Switch to window'), app,
                iconName: 'focus-windows-symbolic',
                activate: () => Main.activateWindow(w),
            };
        });
}

export function converter(query) {
    const r = convert(query);
    if (!r)
        return [];
    return [{
        section: 'Converter', title: r.text, subtitle: _('Enter copies %s').format(r.value),
        iconName: 'preferences-system-time-symbolic',
        activate: () => St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, r.value),
    }];
}

export function calculator(query) {
    const result = calculate(query);
    if (result === null)
        return [];
    return [{
        section: 'Calculator', title: `= ${result}`, subtitle: _('Enter copies the result'),
        iconName: 'accessories-calculator-symbolic',
        activate: () => St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, result),
    }];
}

// Built on use: gettext only works once the extension is running, not at import time.
const systemActions = () => [
    {title: _('Lock Screen'), words: 'lock screen', icon: 'system-lock-screen-symbolic',
        run: () => Main.screenShield.lock(true)},
    {title: _('Suspend'), words: 'suspend sleep', icon: 'weather-clear-night-symbolic',
        run: () => Gio.DBus.system.call('org.freedesktop.login1', '/org/freedesktop/login1',
            'org.freedesktop.login1.Manager', 'Suspend', new GLib.Variant('(b)', [true]),
            null, Gio.DBusCallFlags.NONE, -1, null, null)},
    {title: _('Log Out…'), words: 'log out logout sign out', icon: 'system-log-out-symbolic',
        run: () => spawn(['gnome-session-quit', '--logout'])},
    {title: _('Restart…'), words: 'restart reboot', icon: 'system-reboot-symbolic',
        run: () => spawn(['gnome-session-quit', '--reboot'])},
    {title: _('Power Off…'), words: 'power off shutdown shut down', icon: 'system-shutdown-symbolic',
        run: () => spawn(['gnome-session-quit', '--power-off'])},
];

export function system(query) {
    const q = query.toLowerCase();
    if (q.length < 3)
        return [];
    return systemActions().filter(a => a.words.split(' ').some(w => w.startsWith(q)) || a.title.toLowerCase().startsWith(q))
        .map(a => ({section: 'System', title: a.title, subtitle: _('System action'), iconName: a.icon, activate: a.run}));
}

/** Engines must be plain https URLs with exactly one %s, and a one-word prefix. */
export function isSafeEngine({prefix, name, url}) {
    if (!/^[a-z0-9]{1,8}$/i.test(prefix) || !name || name.length > 40)
        return false;
    if ((url.match(/%s/g) ?? []).length !== 1)
        return false;
    try {
        const uri = GLib.Uri.parse(url.replace('%s', 'x'), GLib.UriFlags.NONE);
        return uri.get_scheme() === 'https' && Boolean(uri.get_host());
    } catch {
        return false;
    }
}

/** Parses 'prefix|Name|https://…%s' engine lines; unsafe lines are dropped. */
export function engines(lines) {
    return lines.map(l => l.split('|')).filter(p => p.length === 3)
        .map(([prefix, name, url]) => ({prefix: prefix.trim(), name: name.trim(), url: url.trim()}))
        .filter(e => isSafeEngine(e));
}

export function web(query, engineList, defaultPrefix) {
    const [head, ...rest] = query.split(' ');
    const engine = engineList.find(e => e.prefix === head);
    const terms = engine ? rest.join(' ').trim() : query;
    const chosen = engine ?? engineList.find(e => e.prefix === defaultPrefix) ?? engineList[0];
    if (!chosen || !terms)
        return [];
    return [{
        section: engine ? 'Web' : 'Search the web', title: _('Search %s for “%s”').format(chosen.name, terms),
        subtitle: engine ? _('prefix “%s”').format(chosen.prefix) : _('Tip: start with %s').format(engineList.map(e => e.prefix).join(', ')),
        iconName: 'web-browser-symbolic', prefixMatch: Boolean(engine),
        activate: () => launchUri(chosen.url.replace('%s', encodeURIComponent(terms))),
    }];
}

/** File and folder results with actions. Programs and scripts are revealed in Files, never run. */
export function files(query, cancellable, onDone, limit = 6) {
    findFiles(query, cancellable, items => onDone(items.map(f => ({
        section: f.kind === 'folder' ? 'Folders' : 'Files', title: f.name, subtitle: f.folder, iconName: f.iconName,
        path: f.path,
        activate: () => (f.runnable ? revealInFiles(f.uri) : launchUri(f.uri)),
        reveal: () => revealInFiles(f.uri),
    }))), limit);
}
