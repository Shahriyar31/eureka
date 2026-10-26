// SPDX-License-Identifier: GPL-2.0-or-later
// Results from GNOME search providers (Characters, Settings, Clocks, Contacts, Software, …): the same apps the
// Activities overview asks, through their public D-Bus interface org.gnome.Shell.SearchProvider2.
// Eureka is its own client: it never touches the overview. It follows Settings → Search (on/off and order).
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';

const IFACE = 'org.gnome.Shell.SearchProvider2';
const TIMEOUT_MS = 1500;
const PER_PROVIDER = 3;
// Eureka already searches files (and refuses to run programs) and does maths itself
const SKIP = ['org.gnome.Nautilus.desktop', 'org.gnome.Calculator.desktop'];
// app stores answer almost every query with unrelated apps: shown last, one result, only for longer queries
const STORES = ['org.gnome.Software.desktop', 'io.github.kolunmi.Bazaar.desktop', 'org.kde.discover.desktop'];

/** Installed and enabled providers, in the user's Settings → Search order. */
export function enabledProviders() {
    const prefs = new Gio.Settings({schema_id: 'org.gnome.desktop.search-providers'});
    if (prefs.get_boolean('disable-external'))
        return [];
    const disabled = prefs.get_strv('disabled'), enabled = prefs.get_strv('enabled');
    const order = prefs.get_strv('sort-order');
    const dirs = [GLib.get_user_data_dir(), ...GLib.get_system_data_dirs()]
        .map(d => GLib.build_filenamev([d, 'gnome-shell', 'search-providers']));
    const seen = new Set(), providers = [];
    for (const dir of dirs) {
        const folder = Gio.File.new_for_path(dir);
        let files;
        try {
            files = folder.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        } catch {
            continue;
        }
        let info;
        while ((info = files.next_file(null))) {
            const name = info.get_name();
            if (!name.endsWith('.ini'))
                continue;
            const key = new GLib.KeyFile();
            try {
                key.load_from_file(GLib.build_filenamev([dir, name]), GLib.KeyFileFlags.NONE);
                const g = 'Shell Search Provider';
                const desktopId = key.get_string(g, 'DesktopId');
                if (seen.has(desktopId) || SKIP.includes(desktopId) || key.get_integer(g, 'Version') < 2)
                    continue;
                let defaultDisabled = false;
                try {
                    defaultDisabled = key.get_boolean(g, 'DefaultDisabled');
                } catch {
                    // the key is optional; providers are enabled by default
                }
                const on = defaultDisabled ? enabled.includes(desktopId) : !disabled.includes(desktopId);
                const app = GioUnix.DesktopAppInfo.new(desktopId);
                seen.add(desktopId);
                if (on && app)
                    providers.push({desktopId, app, busName: key.get_string(g, 'BusName'),
                        objectPath: key.get_string(g, 'ObjectPath')});
            } catch {
                // a broken .ini file is skipped, exactly as GNOME Shell does
            }
        }
        files.close(null);
    }
    providers.forEach(p => {
        p.store = STORES.includes(p.desktopId);
    });
    const rank = p => (p.store ? order.length + 1 : order.includes(p.desktopId) ? order.indexOf(p.desktopId) : order.length);
    return providers.sort((a, b) => rank(a) - rank(b) || a.app.get_name().localeCompare(b.app.get_name()));
}

function call(p, method, params, type, cancellable, onReply) {
    Gio.DBus.session.call(p.busName, p.objectPath, IFACE, method, params, new GLib.VariantType(type),
        Gio.DBusCallFlags.NONE, TIMEOUT_MS, cancellable, (conn, res) => {
            try {
                onReply(conn.call_finish(res).deepUnpack()[0]);
            } catch {
                // provider not running, too slow or cancelled: no results from it
            }
        });
}

function iconOf(meta, app) {
    try {
        if (meta.gicon)
            return Gio.Icon.new_for_string(meta.gicon.unpack());
        if (meta.icon)
            return Gio.icon_deserialize(meta.icon) ?? app.get_icon();
    } catch {
        // an icon the provider sent in a form we cannot read: use the app's icon
    }
    return app.get_icon();
}

/** Asks each provider (from enabledProviders(), read once per opening); onResults(provider, results) per answer. */
export function search(providers, terms, cancellable, onResults) {
    const text = terms.join(' ');
    if (text.length < 2)
        return;   // one letter matches almost everything in every provider
    const long = text.length >= 4;
    for (const p of providers) {
        if (p.store && !long)
            continue;
        call(p, 'GetInitialResultSet', new GLib.Variant('(as)', [terms]), '(as)', cancellable, ids => {
            const top = ids.slice(0, p.store ? 1 : PER_PROVIDER);
            if (!top.length)
                return;
            call(p, 'GetResultMetas', new GLib.Variant('(as)', [top]), '(aa{sv})', cancellable, metas => {
                const results = metas.map(m => {
                    const id = m.id?.unpack?.() ?? '';
                    const name = m.name?.unpack?.() ?? '';
                    const description = m.description?.unpack?.() ?? '';
                    const clipboard = m.clipboardText?.unpack?.() ?? '';
                    return {
                        provider: p.app.get_name(), title: name, subtitle: description || p.app.get_name(),
                        gicon: iconOf(m, p.app), clipboard,
                        activate: () => Gio.DBus.session.call(p.busName, p.objectPath, IFACE, 'ActivateResult',
                            new GLib.Variant('(sasu)', [id, terms, global.get_current_time()]),
                            null, Gio.DBusCallFlags.NONE, -1, null, null),
                    };
                }).filter(r => r.title);
                if (results.length)
                    onResults(p, results);
            });
        });
    }
}
