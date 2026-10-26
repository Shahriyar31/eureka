// SPDX-License-Identifier: GPL-2.0-or-later
// Shortcut helpers for the preferences window: readable names, comparison and clashes with GNOME's own shortcuts.
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

// GNOME's own shortcut lists that a new shortcut can clash with
export const SYSTEM_SCHEMAS = ['org.gnome.desktop.wm.keybindings', 'org.gnome.shell.keybindings', 'org.gnome.mutter.keybindings',
    'org.gnome.mutter.wayland.keybindings', 'org.gnome.settings-daemon.plugins.media-keys'];

export function label(accel) {
    const [ok, key, mods] = Gtk.accelerator_parse(accel);
    return ok ? Gtk.accelerator_get_label(key, mods) : accel;
}

export function sameAccel(a, b) {
    const [okA, keyA, modsA] = Gtk.accelerator_parse(a);
    const [okB, keyB, modsB] = Gtk.accelerator_parse(b);
    return okA && okB && Gdk.keyval_to_lower(keyA) === Gdk.keyval_to_lower(keyB) && modsA === modsB;
}

/** Every GNOME shortcut that uses one of `accels`: [{settings, key, accel, name}]. */
export function findConflicts(accels) {
    const source = Gio.SettingsSchemaSource.get_default();
    const found = [];
    for (const id of SYSTEM_SCHEMAS) {
        const schema = source.lookup(id, true);
        if (!schema)
            continue;
        const settings = new Gio.Settings({settings_schema: schema});
        for (const key of schema.list_keys()) {
            const k = schema.get_key(key);
            if (k.get_value_type().dup_string() !== 'as')
                continue;
            for (const accel of settings.get_strv(key)) {
                const mine = accels.find(a => sameAccel(a, accel));
                if (mine)
                    found.push({settings, key, accel, name: k.get_summary() || key});
            }
        }
    }
    // the user's own shortcuts from Settings → Keyboard → Custom Shortcuts (one settings path each)
    const media = source.lookup('org.gnome.settings-daemon.plugins.media-keys', true);
    const customSchema = source.lookup('org.gnome.settings-daemon.plugins.media-keys.custom-keybinding', true);
    if (media && customSchema) {
        for (const path of new Gio.Settings({settings_schema: media}).get_strv('custom-keybindings')) {
            const custom = new Gio.Settings({settings_schema: customSchema, path});
            const accel = custom.get_string('binding');
            if (accels.some(a => sameAccel(a, accel)))
                found.push({settings: custom, key: 'binding', accel, name: custom.get_string('name') || path, single: true});
        }
    }
    return found;
}

