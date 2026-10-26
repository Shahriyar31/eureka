// SPDX-License-Identifier: GPL-2.0-or-later
// Eureka preferences: Appearance, Behaviour, Web engines and About.
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {SYSTEM_SCHEMAS, findConflicts, label, sameAccel} from './shortcuts.js';

const ENGINE_RE = /^https:\/\/[^\s|]+$/;

function combo(settings, key, title, subtitle, choices) {
    const row = new Adw.ComboRow({title, subtitle, model: Gtk.StringList.new(choices.map(c => c[1]))});
    const sync = () => {
        row.selected = Math.max(0, choices.findIndex(c => c[0] === settings.get_string(key)));
    };
    sync();
    row.connect('notify::selected', () => settings.set_string(key, choices[row.selected][0]));
    settings.connect(`changed::${key}`, sync);
    return row;
}

function spin(settings, key, title, subtitle, lower, upper, step = 1, digits = 0) {
    const row = new Adw.SpinRow({title, subtitle, digits,
        adjustment: new Gtk.Adjustment({lower, upper, step_increment: step, page_increment: step * 5})});
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function toggle(settings, key, title, subtitle = '') {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

/** A dialog that records one key combination, like GNOME Settings → Keyboard → Custom Shortcuts. */
function recordShortcut(parent, onDone) {
    const dialog = new Adw.AlertDialog({heading: _('Set Shortcut'),
        body: _('Press the new key combination. Esc cancels, Backspace keeps the current one.')});
    dialog.add_response('cancel', _('Cancel'));
    const controller = new Gtk.EventControllerKey();
    controller.connect('key-pressed', (c, keyval, keycode, state) => {
        const mask = state & Gtk.accelerator_get_default_mod_mask();
        if (!mask && keyval === Gdk.KEY_Escape) {
            dialog.close();
            return Gdk.EVENT_STOP;
        }
        if (!mask && keyval === Gdk.KEY_BackSpace) {
            dialog.close();
            return Gdk.EVENT_STOP;
        }
        const isModifier = [Gdk.KEY_Super_L, Gdk.KEY_Super_R, Gdk.KEY_Control_L, Gdk.KEY_Control_R,
            Gdk.KEY_Alt_L, Gdk.KEY_Alt_R, Gdk.KEY_Shift_L, Gdk.KEY_Shift_R, Gdk.KEY_Meta_L, Gdk.KEY_Meta_R]
            .includes(keyval);
        if (isModifier || !Gtk.accelerator_valid(keyval, mask) || (!mask && !(keyval >= Gdk.KEY_F1 && keyval <= Gdk.KEY_F12)))
            return Gdk.EVENT_STOP;   // wait for a real combination with a modifier (or a lone F-key)
        onDone(Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask));
        dialog.close();
        return Gdk.EVENT_STOP;
    });
    dialog.add_controller(controller);
    dialog.present(parent);
}

// Ready-made choices; anything else is recorded with "Custom…"
const PRESETS = ['<Super>space', '<Control>space', '<Alt>space', '<Control><Alt>space', '<Super><Alt>space'];
function shortcutGroup(window, settings) {
    const group = new Adw.PreferencesGroup({title: _('Shortcut'),
        description: _('Press it to open Eureka, press it again to close. Choose a ready-made shortcut or record your own.')});

    // main shortcut: presets + Custom…
    const custom = _('Custom…');
    const main = new Adw.ComboRow({title: _('Open and close Eureka')});
    let syncing = false;
    const sync = () => {
        syncing = true;
        const current = settings.get_strv('toggle')[0] ?? '';
        const names = PRESETS.map(label);
        const isPreset = PRESETS.some(p => sameAccel(p, current));
        main.model = Gtk.StringList.new(isPreset || !current ? [...names, custom] : [...names, label(current), custom]);
        main.selected = isPreset ? PRESETS.findIndex(p => sameAccel(p, current)) : current ? PRESETS.length : 0;
        syncing = false;
    };
    main.connect('notify::selected', () => {
        if (syncing)
            return;
        const choice = main.model.get_string(main.selected);
        const list = settings.get_strv('toggle');
        if (choice === custom) {
            recordShortcut(window, accel => {
                list[0] = accel;
                settings.set_strv('toggle', list);
            });
            sync();   // back to the current one until a combination is recorded
            return;
        }
        const preset = PRESETS[main.selected];
        if (preset) {
            list[0] = preset;
            settings.set_strv('toggle', list);
        }
    });
    sync();
    group.add(main);

    // optional second shortcut
    const second = new Adw.ActionRow({title: _('Second shortcut'), subtitle: _('Optional. Click to record'),
        activatable: true});
    const secondLabel = new Gtk.ShortcutLabel({accelerator: settings.get_strv('toggle')[1] ?? '',
        valign: Gtk.Align.CENTER, disabled_text: _('Not set')});
    const clear = new Gtk.Button({icon_name: 'edit-clear-symbolic', valign: Gtk.Align.CENTER,
        tooltip_text: _('Remove'), css_classes: ['flat']});
    clear.connect('clicked', () => settings.set_strv('toggle', settings.get_strv('toggle').slice(0, 1)));
    second.add_suffix(secondLabel);
    second.add_suffix(clear);
    second.connect('activated', () => recordShortcut(window, accel => {
        settings.set_strv('toggle', [settings.get_strv('toggle')[0] ?? PRESETS[0], accel]);
    }));
    group.add(second);

    // clashes with GNOME's own shortcuts, each with a one-click fix
    const conflicts = [];
    const syncConflicts = () => {
        conflicts.splice(0).forEach(r => group.remove(r));
        for (const c of findConflicts(settings.get_strv('toggle'))) {
            const row = new Adw.ActionRow({title: _('%s is also used by GNOME').format(label(c.accel)),
                subtitle: _('“%s”. Free it so Eureka gets the key, or pick another shortcut.').format(c.name)});
            row.add_prefix(new Gtk.Image({icon_name: 'dialog-warning-symbolic'}));
            const free = new Gtk.Button({label: _('Free it'), valign: Gtk.Align.CENTER, css_classes: ['suggested-action']});
            free.connect('clicked', () => (c.single ? c.settings.set_string(c.key, '')
                : c.settings.set_strv(c.key, c.settings.get_strv(c.key).filter(a => a !== c.accel))));
            row.add_suffix(free);
            conflicts.push(row);
            group.add(row);
        }
    };
    syncConflicts();
    settings.connect('changed::toggle', () => {
        sync();
        secondLabel.accelerator = settings.get_strv('toggle')[1] ?? '';
        syncConflicts();
    });
    // re-check after "Free it" (or a change in GNOME Settings) while this window is open
    for (const id of SYSTEM_SCHEMAS) {
        const schema = Gio.SettingsSchemaSource.get_default().lookup(id, true);
        if (schema) {
            const watched = new Gio.Settings({settings_schema: schema});
            watched.connect('changed', syncConflicts);
            window.connect('close-request', () => watched.run_dispose());
        }
    }
    return group;
}

const EngineRow = GObject.registerClass(
class EngineRow extends Adw.ActionRow {
    constructor(line, onRemove) {
        const [prefix, name, url] = line.split('|');
        super({title: `${name}`, subtitle: `${prefix} …   ·   ${url}`});
        this.subtitle_lines = 1;
        this.add_prefix(new Gtk.Label({label: prefix, width_chars: 4, css_classes: ['monospace', 'dim-label']}));
        const remove = new Gtk.Button({icon_name: 'user-trash-symbolic', valign: Gtk.Align.CENTER,
            tooltip_text: _('Remove'), css_classes: ['flat']});
        remove.connect('clicked', onRemove);
        this.add_suffix(remove);
    }
});

function enginesGroup(settings) {
    const group = new Adw.PreferencesGroup({title: _('Web Engines'),
        description: _('Type the prefix and a space to search an engine directly, e.g. “yt lofi”. Only https addresses are accepted.')});
    const rows = [];
    const rebuild = () => {
        rows.splice(0).forEach(r => group.remove(r));
        const lines = settings.get_strv('web-engines');
        lines.forEach((line, i) => {
            if (line.split('|').length !== 3)
                return;
            const row = new EngineRow(line, () => settings.set_strv('web-engines', lines.filter((_l, j) => j !== i)));
            rows.push(row);
            group.add(row);
        });
        const add = new Adw.ExpanderRow({title: _('Add Engine')});
        const prefix = new Adw.EntryRow({title: _('Prefix (e.g. so)')});
        const name = new Adw.EntryRow({title: _('Name (e.g. Stack Overflow)')});
        const url = new Adw.EntryRow({title: _('Address with %s for the words')});
        const save = new Gtk.Button({label: _('Add'), halign: Gtk.Align.END, margin_top: 6, margin_bottom: 6,
            margin_end: 6, css_classes: ['suggested-action']});
        const status = new Gtk.Label({css_classes: ['error'], halign: Gtk.Align.START, margin_start: 12,
            ellipsize: Pango.EllipsizeMode.END});
        save.connect('clicked', () => {
            const p = prefix.text.trim(), n = name.text.trim(), u = url.text.trim();
            const used = settings.get_strv('web-engines').some(l => l.split('|')[0] === p);
            let error = '';
            if (!/^[a-z0-9]{1,8}$/i.test(p))
                error = _('Prefix: 1–8 letters or digits.');
            else if (used)
                error = _('That prefix is already used.');
            else if (!n || n.length > 40 || n.includes('|'))
                error = _('Name: up to 40 characters, no “|”.');
            else if (!ENGINE_RE.test(u) || (u.match(/%s/g) ?? []).length !== 1)
                error = _('Address must start with https:// and contain %s exactly once.');
            status.label = error;
            if (!error)
                settings.set_strv('web-engines', [...settings.get_strv('web-engines'), `${p}|${n}|${u}`]);
        });
        [prefix, name, url].forEach(r => add.add_row(r));
        const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
        box.append(status);
        box.append(save);
        const holder = new Adw.PreferencesRow({child: box, activatable: false});
        add.add_row(holder);
        rows.push(add);
        group.add(add);

        const fallback = combo(settings, 'default-engine', _('Fallback engine'),
            _('Used for the “Search the Web” row'),
            settings.get_strv('web-engines').map(l => l.split('|')).filter(p => p.length === 3).map(p => [p[0], p[1]]));
        rows.push(fallback);
        group.add(fallback);
    };
    rebuild();
    settings.connect('changed::web-engines', rebuild);
    return group;
}

export default class EurekaPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(640, 760);
        window.search_enabled = true;

        // ---------- Appearance ----------
        const look = new Adw.PreferencesPage({title: _('Appearance'), icon_name: 'applications-graphics-symbolic'});
        const style = new Adw.PreferencesGroup({title: _('Style')});
        style.add(combo(settings, 'theme-mode', _('Theme'), _('Follow the system or force light or dark'),
            [['auto', _('Follow system')], ['light', _('Light')], ['dark', _('Dark')]]));
        style.add(combo(settings, 'accent-source', _('Accent colour'), _('The colour every tone is derived from'),
            [['system', _('System accent')], ['custom', _('Custom colour')]]));
        const colorRow = new Adw.ActionRow({title: _('Custom colour')});
        const colorButton = new Gtk.ColorDialogButton({dialog: new Gtk.ColorDialog({with_alpha: false}),
            valign: Gtk.Align.CENTER});
        const rgba = new Gdk.RGBA();
        rgba.parse(settings.get_string('custom-accent'));
        colorButton.rgba = rgba;
        colorButton.connect('notify::rgba', () => {
            const c = colorButton.rgba;
            const hex = `#${[c.red, c.green, c.blue].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
            settings.set_string('custom-accent', hex);
        });
        colorRow.add_suffix(colorButton);
        const syncColor = () => {
            colorRow.sensitive = settings.get_string('accent-source') === 'custom';
        };
        syncColor();
        settings.connect('changed::accent-source', syncColor);
        style.add(colorRow);
        style.add(combo(settings, 'icon-style', _('Icons'), _('Tinted circles in the Material style, or plain'),
            [['tonal', _('Tonal circles')], ['plain', _('Plain')]]));
        style.add(toggle(settings, 'animations', _('Animations'), _('Fade and scale when opening and closing')));
        const speed = spin(settings, 'animation-speed', _('Animation speed'), _('1.0 is normal; higher is faster'),
            0.5, 2.0, 0.1, 1);
        settings.bind('animations', speed, 'sensitive', Gio.SettingsBindFlags.GET);
        style.add(speed);
        look.add(style);

        const shape = new Adw.PreferencesGroup({title: _('Shape and Size')});
        shape.add(spin(settings, 'corner-radius', _('Corner radius'), _('Pixels; 28 is the Material default'), 0, 40));
        shape.add(spin(settings, 'panel-width', _('Width'), _('Pixels'), 480, 1000, 10));
        shape.add(spin(settings, 'vertical-position', _('Distance from top'), _('Percent of the screen height'), 5, 45));
        shape.add(combo(settings, 'density', _('Density'), '', [['comfortable', _('Comfortable')], ['compact', _('Compact')]]));
        look.add(shape);

        const text = new Adw.PreferencesGroup({title: _('Text')});
        const fontRow = new Adw.ActionRow({title: _('Font'), subtitle: _('Leave empty for the system font')});
        const fontButton = new Gtk.FontDialogButton({dialog: new Gtk.FontDialog(), level: Gtk.FontLevel.FAMILY,
            valign: Gtk.Align.CENTER});
        const current = settings.get_string('font-family');
        if (current)
            fontButton.font_desc = Pango.FontDescription.from_string(current);
        fontButton.connect('notify::font-desc', () => settings.set_string('font-family', fontButton.font_desc?.get_family() ?? ''));
        const resetFont = new Gtk.Button({icon_name: 'edit-clear-symbolic', valign: Gtk.Align.CENTER,
            tooltip_text: _('Use the system font'), css_classes: ['flat']});
        resetFont.connect('clicked', () => settings.set_string('font-family', ''));
        fontRow.add_suffix(fontButton);
        fontRow.add_suffix(resetFont);
        text.add(fontRow);
        text.add(spin(settings, 'font-scale', _('Text size'), _('1.0 is normal'), 0.8, 1.4, 0.05, 2));
        text.add(toggle(settings, 'show-sections', _('Section headings')));
        text.add(toggle(settings, 'show-subtitles', _('Second line under results')));
        text.add(toggle(settings, 'show-hints', _('Keyboard hints')));
        look.add(text);

        const depth = new Adw.PreferencesGroup({title: _('Transparency and Depth')});
        depth.add(spin(settings, 'opacity', _('Panel opacity'), _('Percent; lower it to see the blur'), 60, 100));
        depth.add(toggle(settings, 'blur', _('Blur behind the panel'), _('Frosted glass, using GNOME’s own blur')));
        const blurRadius = spin(settings, 'blur-radius', _('Blur strength'), '', 5, 100, 5);
        settings.bind('blur', blurRadius, 'sensitive', Gio.SettingsBindFlags.GET);
        depth.add(blurRadius);
        depth.add(spin(settings, 'backdrop-dim', _('Dim the screen behind'), _('Percent'), 0, 60));
        depth.add(toggle(settings, 'show-outline', _('Outline'), _('A thin line around the panel')));
        look.add(depth);
        window.add(look);

        // ---------- Behaviour ----------
        const behave = new Adw.PreferencesPage({title: _('Behaviour'), icon_name: 'preferences-system-symbolic'});
        behave.add(shortcutGroup(window, settings));
        const keys = new Adw.PreferencesGroup({title: _('Where')});
        keys.add(combo(settings, 'open-on', _('Open on'), _('Which screen Eureka appears on'),
            [['pointer', _('Screen with the mouse pointer')], ['primary', _('Primary screen')]]));
        keys.add(toggle(settings, 'show-panel-icon', _('Top bar icon'), _('Open Eureka with the mouse')));
        behave.add(keys);

        const sources = new Adw.PreferencesGroup({title: _('Search In')});
        sources.add(toggle(settings, 'show-apps', _('Applications')));
        sources.add(toggle(settings, 'show-windows', _('Open windows'), _('Switch to a window by title or app')));
        sources.add(toggle(settings, 'show-files', _('Files'), _('Uses GNOME’s file index (Settings → Search)')));
        sources.add(toggle(settings, 'show-suggestions', _('Suggestions'), _('Your most used apps, before you type')));
        sources.add(toggle(settings, 'show-providers', _('GNOME search providers'),
            _('Characters (emoji), Settings, Clocks, Software, Contacts… as chosen in Settings → Search')));
        sources.add(toggle(settings, 'show-calculator', _('Calculator'), _('12*(3+4), sqrt(2), 2^10, pi')));
        sources.add(toggle(settings, 'show-converter', _('Unit converter'), _('10 km to mi, 100 f to c, 2 gb to mb (offline)')));
        sources.add(toggle(settings, 'show-system', _('System actions'), _('Lock, suspend, log out, restart, power off')));
        sources.add(toggle(settings, 'show-web', _('Web search'), _('Prefixes and a fallback row')));
        behave.add(sources);

        const limits = new Adw.PreferencesGroup({title: _('Results')});
        limits.add(spin(settings, 'max-results', _('Maximum rows'), '', 4, 16));
        limits.add(spin(settings, 'apps-limit', _('Applications'), '', 1, 10));
        limits.add(spin(settings, 'files-limit', _('Files'), '', 1, 10));
        behave.add(limits);
        window.add(behave);

        // ---------- Web ----------
        const web = new Adw.PreferencesPage({title: _('Web'), icon_name: 'web-browser-symbolic'});
        web.add(enginesGroup(settings));
        window.add(web);

        // ---------- About ----------
        const about = new Adw.PreferencesPage({title: _('About'), icon_name: 'help-about-symbolic'});
        const info = new Adw.PreferencesGroup({title: 'Eureka',
            description: _('Spotlight-style search for GNOME. Your searches stay on this computer: Eureka does not use the network, does not log what you type, and never runs programs or scripts it finds.')});
        const link = new Adw.ActionRow({title: _('Source code and issues'), subtitle: this.metadata.url ?? '',
            activatable: true});
        link.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
        link.connect('activated', () => Gtk.show_uri(window, this.metadata.url, Gdk.CURRENT_TIME));
        info.add(link);
        const reset = new Adw.ActionRow({title: _('Reset all settings'), subtitle: _('Back to the defaults')});
        const resetButton = new Gtk.Button({label: _('Reset'), valign: Gtk.Align.CENTER, css_classes: ['destructive-action']});
        resetButton.connect('clicked', () => settings.settings_schema.list_keys().forEach(k => settings.reset(k)));
        reset.add_suffix(resetButton);
        info.add(reset);
        about.add(info);
        window.add(about);
    }
}
