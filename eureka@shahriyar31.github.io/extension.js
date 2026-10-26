// SPDX-License-Identifier: GPL-2.0-or-later
// Eureka: a Spotlight-style search bar for GNOME Shell, with a Material-inspired look.
// It draws its own window above the desktop and never touches the overview's search actors.
// Privacy: queries stay on this computer and are never logged; only the web row opens a URL, when chosen.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as AnimationUtils from 'resource:///org/gnome/shell/misc/animationUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Gnome from './providers/gnome.js';
import * as Sources from './providers/sources.js';
import {palette, SYSTEM_ACCENTS} from './theme.js';

const DEBOUNCE_MS = 80;
const ANIMATION_MS = 160;
const SECTION_ORDER = ['suggested', 'calculator', 'converter', 'system', 'apps', 'windows', 'provider', 'web', 'files',
    'store', 'fallback'];

function sectionTitle(r) {
    if (r.section === 'provider' || r.section === 'store')
        return r.provider;
    return {
        suggested: _('Suggested'), calculator: _('Calculator'), converter: _('Converter'), system: _('System'),
        apps: _('Applications'), windows: _('Open Windows'), web: _('Web'), files: _('Files'),
        fallback: _('Search the Web'),
    }[r.section] ?? r.section;
}
const sectionKey = r => (r.section === 'provider' || r.section === 'store' ? `${r.section}:${r.provider}` : r.section);

/** Font names from settings only reach CSS if they are plain names (no quotes, semicolons or braces). */
function safeFont(name) {
    const n = (name ?? '').trim();
    return /^[\p{L}\p{N} \-_.]{1,60}$/u.test(n) ? n : '';
}

function safeHex(hex) {
    return /^#[0-9a-f]{6}$/i.test(hex ?? '') ? hex : '#6750a4';
}

class EurekaPanel {
    constructor(settings) {
        this._settings = settings;
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._results = [];
        this._selected = 0;
        this._query = '';
        this._debounceId = 0;
        this._cancellable = null;
        this._fading = new Set();   // closed panels still fading out
        this._idles = new Set();
        this._timers = new Set();
    }

    get isOpen() {
        return Boolean(this._backdrop);
    }

    toggle() {
        if (this.isOpen)
            this.close();
        else
            this.open();
    }

    // ---------- look ----------
    _colors() {
        const s = this._settings;
        const mode = s.get_string('theme-mode');
        const dark = mode === 'dark' || (mode === 'auto' && this._interface.get_string('color-scheme') === 'prefer-dark');
        const accent = s.get_string('accent-source') === 'custom' ? safeHex(s.get_string('custom-accent'))
            : SYSTEM_ACCENTS[this._interface.get_string('accent-color')] ?? SYSTEM_ACCENTS.blue;
        return palette(accent, dark, s.get_int('opacity') / 100);
    }

    _monitor() {
        if (this._settings.get_string('open-on') === 'pointer') {
            const [x, y] = global.get_pointer();
            const m = Main.layoutManager.monitors.find(mo => x >= mo.x && x < mo.x + mo.width &&
                y >= mo.y && y < mo.y + mo.height);
            if (m)
                return m;
        }
        return Main.layoutManager.primaryMonitor;
    }

    // ---------- open / close ----------
    open() {
        if (this.isOpen)
            return;
        if (Main.overview.visible)
            Main.overview.hide();
        const s = this._settings;
        const c = this._colors();
        this._c = c;
        const m = this._monitor();
        const scale = s.get_double('font-scale');
        const compact = s.get_string('density') === 'compact';
        const radius = s.get_int('corner-radius');
        const font = safeFont(s.get_string('font-family'));
        this._compact = compact;
        this._providers = s.get_boolean('show-providers') ? Gnome.enabledProviders() : [];

        const dim = s.get_int('backdrop-dim') / 100;
        this._backdrop = new St.Widget({reactive: true, x: m.x, y: m.y, width: m.width, height: m.height,
            style: `background-color: rgba(${c.backdrop.join(', ')}, ${dim.toFixed(2)});`});
        this._backdrop.connect('button-press-event', (actor, event) => {
            if (global.stage.get_event_actor(event) === this._backdrop) {
                this.close();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._box = new St.BoxLayout({
            style_class: `eureka${compact ? ' compact' : ''}`, vertical: true,
            style: `width: ${s.get_int('panel-width')}px; border-radius: ${radius}px; background-color: ${c.surface};` +
                `${s.get_boolean('show-outline') ? `border: 1px solid ${c.outline};` : ''}` +
                `box-shadow: 0 24px 64px ${c.shadow}; color: ${c.text};` +
                `font-size: ${(11 * scale).toFixed(1)}pt;${font ? ` font-family: "${font}";` : ''}`,
        });

        const fieldRadius = Math.max(0, radius - 10);
        const bar = new St.BoxLayout({style_class: 'eureka-field',
            style: `background-color: ${c.searchField}; border-radius: ${fieldRadius}px;`});
        bar.add_child(new St.Icon({icon_name: 'system-search-symbolic', style_class: 'eureka-field-icon',
            style: `color: ${c.primary};`, y_align: Clutter.ActorAlign.CENTER}));
        this._entry = new St.Entry({style_class: 'eureka-entry', hint_text: _('Search apps, files, maths, web…'),
            can_focus: true, x_expand: true,
            style: `color: ${c.text}; caret-color: ${c.primary}; selection-background-color: ${c.selected};` +
                `font-size: ${(16 * scale).toFixed(1)}pt;`});
        bar.add_child(this._entry);
        const closeButton = new St.Button({style_class: 'eureka-close', can_focus: true, y_align: Clutter.ActorAlign.CENTER,
            accessible_name: _('Close'), child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 16}),
            style: `color: ${c.textVariant};`});
        closeButton.connect('clicked', () => this.close());
        bar.add_child(closeButton);
        this._box.add_child(bar);

        // the list scrolls once it would reach the bottom of the screen; hints stay visible below it
        const top = s.get_int('vertical-position') / 100;
        const maxHeight = Math.max(200, Math.round(m.height / St.ThemeContext.get_for_stage(global.stage).scale_factor *
            (1 - top)) - 190);
        this._scroll = new St.ScrollView({style_class: 'eureka-scroll', overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
            style: `max-height: ${maxHeight}px;`});
        this._list = new St.BoxLayout({style_class: 'eureka-list', vertical: true});
        this._scroll.add_child(this._list);
        this._box.add_child(this._scroll);
        this._footer = new St.BoxLayout({vertical: true});
        this._box.add_child(this._footer);
        this._backdrop.add_child(this._box);
        Main.layoutManager.uiGroup.add_child(this._backdrop);
        if (s.get_boolean('blur')) {
            // GNOME's own background blur, added once the panel is on stage so its size can be measured
            this._blur = new St.Widget({style: `border-radius: ${radius}px;`, clip_to_allocation: true});
            this._blur.add_effect(new Shell.BlurEffect({mode: Shell.BlurMode.BACKGROUND, brightness: 1.0,
                radius: s.get_int('blur-radius')}));
            this._backdrop.insert_child_below(this._blur, this._box);
            this._box.bind_property('position', this._blur, 'position', GObject.BindingFlags.SYNC_CREATE);
            this._box.bind_property('size', this._blur, 'size', GObject.BindingFlags.SYNC_CREATE);
        }

        this._box.connect('notify::width', () => this._place(m));
        this._place(m);

        this._entry.clutter_text.connect('text-changed', () => this._queueSearch());
        // keys are caught on their way in, before the text field: Esc, arrows and Enter work wherever the focus is
        this._backdrop.connect('captured-event', (actor, event) =>
            (event.type() === Clutter.EventType.KEY_PRESS ? this._onKey(event) : Clutter.EVENT_PROPAGATE));
        this._grab = Main.pushModal(this._backdrop, {actionMode: Shell.ActionMode.POPUP});
        if (!this._grab) {   // another modal (e.g. a dialog) holds the keyboard
            this._destroyActors();
            return;
        }
        this._entry.grab_key_focus();
        this._search('');   // suggestions before typing
        this._animateIn();
    }

    _animate() {
        return this._settings.get_boolean('animations') && St.Settings.get().enable_animations;
    }

    _duration(ms) {
        return Math.round(ms / this._settings.get_double('animation-speed'));
    }

    _animateIn() {
        if (!this._animate())
            return;
        this._box.set_pivot_point(0.5, 0);
        this._box.opacity = 0;
        this._box.scale_x = this._box.scale_y = 0.96;
        const box = this._box, duration = this._duration(ANIMATION_MS);
        box.ease({opacity: 255, scale_x: 1, scale_y: 1, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        // safety net: if the compositor draws no frames (idle virtual display, screen blanking), never stay invisible
        this._after(duration + 250, () => {
            if (box === this._box && box.opacity < 255) {
                box.remove_all_transitions();
                box.opacity = 255;
                box.scale_x = box.scale_y = 1;
            }
        });
    }

    _after(ms, fn) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timers.delete(id);
            fn();
            return GLib.SOURCE_REMOVE;
        });
        this._timers.add(id);
    }

    close() {
        if (!this.isOpen)
            return;
        if (this._debounceId)
            GLib.source_remove(this._debounceId);
        this._debounceId = 0;
        this._cancellable?.cancel();
        this._cancellable = null;
        if (this._grab)
            Main.popModal(this._grab);
        this._grab = null;
        const backdrop = this._backdrop, box = this._box;
        this._blur?.hide();
        this._backdrop = null;   // Eureka counts as closed now and can reopen at once, even mid-fade
        this._destroyActors();
        if (!this._animate()) {
            backdrop.destroy();
            return;
        }
        backdrop.reactive = false;
        this._fading.add(backdrop);
        box.ease({scale_x: 0.98, scale_y: 0.98, duration: this._duration(ANIMATION_MS * 0.6),
            mode: Clutter.AnimationMode.EASE_IN_QUAD});
        const duration = this._duration(ANIMATION_MS * 0.6);
        backdrop.ease({opacity: 0, duration, mode: Clutter.AnimationMode.EASE_IN_QUAD,
            // destroy after the frame that ran this callback, never inside it
            onStopped: () => this._later(() => this._discard(backdrop))});
        this._after(duration + 300, () => this._discard(backdrop));   // same safety net as opening
    }

    _later(fn) {
        const id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._idles.delete(id);
            fn();
            return GLib.SOURCE_REMOVE;
        });
        this._idles.add(id);
    }

    _discard(actor) {
        if (this._fading.delete(actor))
            actor.destroy();
    }

    _destroyActors() {
        this._backdrop?.destroy();
        this._backdrop = null;
        this._blur = null;
        this._providers = [];
        this._box = null;
        this._entry = null;
        this._list = null;
        this._scroll = null;
        this._footer = null;
        this._results = [];
        this._query = '';
    }

    _place(m) {
        const top = this._settings.get_int('vertical-position') / 100;
        this._box.set_position(Math.round((m.width - this._box.width) / 2), Math.round(m.height * top));
    }

    // ---------- search ----------
    _queueSearch() {
        if (this._debounceId)
            GLib.source_remove(this._debounceId);
        this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
            this._debounceId = 0;
            if (this._entry)
                this._search(this._entry.get_text().trim());
            return GLib.SOURCE_REMOVE;
        });
    }

    _search(q) {
        this._query = q;
        this._selected = 0;
        this._cancellable?.cancel();
        this._cancellable = new Gio.Cancellable();
        const s = this._settings;
        if (!q) {
            this._results = s.get_boolean('show-suggestions') ? this._suggestions() : [];
            this._render();
            return;
        }
        const tag = (list, section) => list.map(r => ({...r, section}));
        const engines = Sources.engines(s.get_strv('web-engines'));
        const web = s.get_boolean('show-web') ? Sources.web(q, engines, s.get_string('default-engine')) : [];
        const prefixed = web.some(r => r.prefixMatch);
        const fixed = prefixed ? tag(web, 'web') : [
            ...(s.get_boolean('show-calculator') ? tag(Sources.calculator(q), 'calculator') : []),
            ...(s.get_boolean('show-converter') ? tag(Sources.converter(q), 'converter') : []),
            ...(s.get_boolean('show-system') ? tag(Sources.system(q), 'system') : []),
            ...(s.get_boolean('show-apps') ? tag(Sources.apps(q, s.get_int('apps-limit')), 'apps') : []),
            ...(s.get_boolean('show-windows') ? tag(Sources.windows(q), 'windows') : []),
            ...tag(web, 'fallback'),
        ];
        let files = [], provided = [];
        // Settings pages come both as apps and from the Settings provider: show each name once
        const shown = new Set(fixed.map(r => r.title.toLowerCase()));
        const update = () => {
            if (q === this._query && this.isOpen)
                this._setResults([...fixed, ...provided.filter(r => !shown.has(r.title.toLowerCase())), ...files]);
        };
        update();
        if (prefixed)
            return;
        if (s.get_boolean('show-files'))
            Sources.files(q, this._cancellable, r => {
                files = tag(r, 'files');
                update();
            }, s.get_int('files-limit'));
        if (fixed.some(r => r.section === 'calculator' || r.section === 'converter'))
            return;   // a sum or a conversion is the answer; provider noise would bury it
        Gnome.search(this._providers, q.split(/\s+/).filter(Boolean), this._cancellable, (p, r) => {
            provided = [...provided, ...tag(r, p.store ? 'store' : 'provider').map(x => ({...x, provider: x.provider}))];
            update();
        });
    }

    _suggestions() {
        return Shell.AppUsage.get_default().get_most_used().slice(0, 6).map(app => ({
            section: 'suggested', title: app.get_name(), subtitle: app.get_description() || '', app,
            activate: () => app.activate(),
        }));
    }

    _setResults(results) {
        const max = this._settings.get_int('max-results');
        const q = this._query.toLowerCase();
        // a system action whose name starts with the query is the top hit ("lock" → Lock Screen), as on macOS
        const providerOrder = this._providers.map(p => p.app.get_name());
        const rank = r => (r.section === 'system' && r.title.toLowerCase().startsWith(q) ? -1
            : SECTION_ORDER.indexOf(r.section) + (r.section === 'provider' ? providerOrder.indexOf(r.provider) / 100 : 0));
        const sorted = [...results].sort((a, b) => rank(a) - rank(b));
        const fallback = sorted.filter(r => r.section === 'fallback');
        this._results = [...sorted.filter(r => r.section !== 'fallback').slice(0, max - fallback.length), ...fallback];
        this._selected = Math.min(this._selected, Math.max(0, this._results.length - 1));
        this._render();
    }

    // ---------- drawing ----------
    _render() {
        if (!this._list)
            return;
        const c = this._c, s = this._settings;
        this._list.destroy_all_children();
        this._footer.destroy_all_children();
        if (s.get_boolean('show-hints'))
            this._footer.add_child(this._hints());
        if (!this._results.length) {
            if (this._query)
                this._list.add_child(new St.Label({style_class: 'eureka-empty', text: _('No results'),
                    style: `color: ${c.textVariant};`}));
            return;
        }
        this._list.add_child(new St.Widget({style_class: 'eureka-divider', style: `background-color: ${c.divider};`}));
        const tonal = s.get_string('icon-style') === 'tonal';
        let section = null;
        this._results.forEach((r, i) => {
            if (s.get_boolean('show-sections') && sectionKey(r) !== section) {
                section = sectionKey(r);
                this._list.add_child(new St.Label({style_class: 'eureka-section', text: sectionTitle(r),
                    style: `color: ${c.section};`}));
            }
            const row = this._row(r, i, tonal);
            this._list.add_child(row);
            if (i === this._selected)
                this._selectedRow = row;
        });
    }

    /** Keyboard moves can go past the visible part of the list: scroll the selected row into view. */
    _reveal() {
        this._later(() => {
            if (this._scroll && this._selectedRow?.get_parent())
                AnimationUtils.ensureActorVisibleInScrollView(this._scroll, this._selectedRow);
        });
    }

    _row(r, i, tonal) {
        const c = this._c, selected = i === this._selected;
        const appIcon = Boolean(r.app && (r.section === 'apps' || r.section === 'suggested'));
        const row = new St.Button({style_class: 'eureka-row', x_expand: true, can_focus: false,
            style: selected ? `background-color: ${c.selected}; color: ${c.onSelected};` : ''});
        const box = new St.BoxLayout({style_class: 'eureka-row-box', x_expand: true});

        const icon = appIcon ? r.app.create_icon_texture(this._compact ? 28 : 34)
            : r.gicon ? new St.Icon({gicon: r.gicon, icon_size: this._compact ? 24 : 30})
            : new St.Icon({icon_name: r.iconName || 'text-x-generic-symbolic',
                icon_size: tonal ? 18 : (this._compact ? 22 : 26), style: `color: ${c.iconColor};`});
        const useTonal = tonal && !appIcon && !r.gicon;
        box.add_child(new St.Bin({style_class: useTonal ? 'eureka-icon tonal' : 'eureka-icon', child: icon,
            y_align: Clutter.ActorAlign.CENTER, style: useTonal ? `background-color: ${c.iconContainer};` : ''}));

        const text = new St.BoxLayout({vertical: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        const title = new St.Label({text: r.title, style_class: 'eureka-title'});
        title.clutter_text.ellipsize = 3;
        text.add_child(title);
        if (r.subtitle && this._settings.get_boolean('show-subtitles')) {
            const sub = new St.Label({text: r.subtitle, style_class: 'eureka-sub',
                style: `color: ${selected ? c.onSelected : c.textVariant};`});
            sub.clutter_text.ellipsize = 3;
            text.add_child(sub);
        }
        box.add_child(text);
        const keyText = selected ? (r.reveal ? '⏎    Ctrl ⏎' : '⏎') : i < 9 ? `Alt ${i + 1}` : '';
        if (keyText && this._settings.get_boolean('show-hints'))
            box.add_child(new St.Label({text: keyText, style_class: 'eureka-key', y_align: Clutter.ActorAlign.CENTER,
                style: `color: ${selected ? c.onSelected : c.hint};`}));
        row.set_child(box);
        row.connect('clicked', () => this._activate(r, false));
        row.connect('enter-event', () => {
            if (this._selected !== i) {
                this._selected = i;
                this._render();
            }
        });
        return row;
    }

    _hints() {
        const c = this._c;
        const box = new St.BoxLayout({style_class: 'eureka-hints'});
        for (const [k, v] of [['↑↓', _('move')], ['⏎', _('open')], ['Alt 1–9', _('quick open')],
            ['Ctrl ⏎', _('show in Files')], ['Alt ⏎', _('copy path')], ['Esc', _('close')]]) {
            box.add_child(new St.Label({text: k, style_class: 'eureka-chip',
                style: `background-color: ${c.searchField}; color: ${c.textVariant};`}));
            box.add_child(new St.Label({text: v, style_class: 'eureka-chip-text', style: `color: ${c.hint};`}));
        }
        return box;
    }

    // ---------- keys and actions ----------
    _onKey(event) {
        const key = event.get_key_symbol();
        // a click on a row takes the keyboard focus away from the field: give it back so typing continues
        if (this._entry && !this._entry.clutter_text.has_key_focus() && event.get_key_unicode() > ' ')
            this._entry.grab_key_focus();
        const ctrl = (event.get_state() & Clutter.ModifierType.CONTROL_MASK) !== 0;
        const alt = (event.get_state() & Clutter.ModifierType.MOD1_MASK) !== 0;
        const n = this._results.length;
        if (alt && key >= Clutter.KEY_1 && key <= Clutter.KEY_9) {
            const r = this._results[key - Clutter.KEY_1];
            if (r)
                this._activate(r, false);
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_Escape) {
            this.close();
            return Clutter.EVENT_STOP;
        }
        if ((key === Clutter.KEY_Down || key === Clutter.KEY_Up || key === Clutter.KEY_Tab ||
            key === Clutter.KEY_ISO_Left_Tab) && n) {
            const back = key === Clutter.KEY_Up || key === Clutter.KEY_ISO_Left_Tab;
            this._selected = (this._selected + (back ? n - 1 : 1)) % n;
            this._render();
            this._reveal();
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
            const r = this._results[this._selected];
            if (r && alt && (r.path || r.clipboard)) {
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, r.path ?? r.clipboard);
                this.close();
            } else if (r) {
                this._activate(r, ctrl);
            }
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _activate(r, reveal) {
        this.close();
        try {
            if (reveal && r.reveal)
                r.reveal();
            else
                r.activate();
        } catch (e) {
            console.log(`Eureka: could not open a result (${e.message})`);
        }
    }

    destroy() {
        this.close();
        this._destroyActors();
        this._idles.forEach(id => GLib.source_remove(id));
        this._idles.clear();
        this._timers.forEach(id => GLib.source_remove(id));
        this._timers.clear();
        this._fading.forEach(a => a.destroy());
        this._fading.clear();
        this._interface = null;
    }
}

export default class EurekaExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._panel = new EurekaPanel(this._settings);
        Main.wm.addKeybinding('toggle', this._settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP, () => this._panel.toggle());
        this._settings.connectObject('changed::show-panel-icon', () => this._syncIcon(), this);
        this._syncIcon();
    }

    _syncIcon() {
        const want = this._settings.get_boolean('show-panel-icon');
        if (want && !this._icon) {
            this._icon = new PanelMenu.Button(0.5, 'Eureka', true);
            this._icon.add_child(new St.Icon({icon_name: 'system-search-symbolic', style_class: 'system-status-icon'}));
            this._icon.connect('button-press-event', () => {
                this._panel.toggle();
                return Clutter.EVENT_STOP;
            });
            Main.panel.addToStatusArea(this.uuid, this._icon);
        } else if (!want && this._icon) {
            this._icon.destroy();
            this._icon = null;
        }
    }

    disable() {
        this._settings.disconnectObject(this);
        this._icon?.destroy();
        this._icon = null;
        Main.wm.removeKeybinding('toggle');
        this._panel?.destroy();
        this._panel = null;
        this._settings = null;
    }
}
