// Development only (not part of the Eureka package): opens Eureka in an isolated test session,
// types the queries from EUREKA_QUERIES, logs the result rows and saves a screenshot of each step.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';



import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class DevTest extends Extension {
    enable() {
        const queries = (GLib.getenv('EUREKA_QUERIES') ?? '').split(';').filter(Boolean);
        const outDir = GLib.getenv('EUREKA_SHOTS') ?? '/tmp';
        let n = 0;
        const panel = () => Main.extensionManager.lookup('eureka@shahriyar31.github.io')?.stateObj?._panel;
        const shoot = (name, then) => {
            const file = Gio.File.new_for_path(`${outDir}/${String(n++).padStart(2, '0')}-${name}.png`);
            const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
            new Shell.Screenshot().screenshot(false, stream, (o, res) => {
                try {
                    o.screenshot_finish(res);
                } catch (e) {
                    console.log(`DEVTEST screenshot failed: ${e}`);
                }
                stream.close(null);
                then();
            });
        };
        const step = () => {
            const p = panel();
            const q = queries.shift();
            if (!p || q === undefined) {
                p?.close();
                console.log(`DEVTEST done${p ? '' : ' (Eureka not found)'}`);
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => global.context.terminate());
                return GLib.SOURCE_REMOVE;
            }
            if (q === '<prefs>') {   // open the preferences window and photograph it
                p.close();
                Gio.Subprocess.new(['gnome-extensions', 'prefs', 'eureka@shahriyar31.github.io'], Gio.SubprocessFlags.NONE);
                this._id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
                    shoot('prefs', () => {
                        this._id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, step);
                    });
                    return GLib.SOURCE_REMOVE;
                });
                return GLib.SOURCE_REMOVE;
            }
            // real input through GNOME's input pipeline, like a person: <key Escape>, <key super+space>, <click-outside>
            if (q.startsWith('<key ') || q === '<click-outside>' || q === '<open>' || q === '<click-close>') {
                const seat = Clutter.get_default_backend().get_default_seat();
                this._kbd ??= seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
                this._ptr ??= seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
                const now = () => GLib.get_monotonic_time();
                if (q === '<open>') {
                    p.open();
                } else if (q === '<click-close>') {
                    const find = a => (a.has_style_class_name?.('eureka-close') ? a : a.get_children().map(find).find(Boolean));
                    const btn = find(p._box);
                    const [bx, by] = btn.get_transformed_position();
                    this._ptr.notify_absolute_motion(now(), bx + btn.width / 2, by + btn.height / 2);
                    this._ptr.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
                    this._ptr.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
                } else if (q === '<click-outside>') {
                    const m = Main.layoutManager.primaryMonitor;
                    this._ptr.notify_absolute_motion(now(), m.x + 40, m.y + m.height - 40);
                    this._ptr.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
                    this._ptr.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
                } else {
                    const keys = q.slice(5, -1).split('+').map(k => ({super: Clutter.KEY_Super_L, space: Clutter.KEY_space,
                        escape: Clutter.KEY_Escape, ctrl: Clutter.KEY_Control_L, alt: Clutter.KEY_Alt_L}[k.toLowerCase()] ??
                        Clutter[`KEY_${k}`]));
                    keys.forEach(k => this._kbd.notify_keyval(now(), k, Clutter.KeyState.PRESSED));
                    [...keys].reverse().forEach(k => this._kbd.notify_keyval(now(), k, Clutter.KeyState.RELEASED));
                }
                this._id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, () => {
                    console.log(`DEVTEST ${q} -> panel open=${p.isOpen}`);
                    this._id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, step);
                    return GLib.SOURCE_REMOVE;
                });
                return GLib.SOURCE_REMOVE;
            }
            if (q.startsWith('<gset ')) {   // <gset schema key gvariant> changes any GNOME setting in the test session
                const [schema, key, ...rest] = q.slice(6, -1).split(' ');
                new Gio.Settings({schema_id: schema}).set_value(key, GLib.Variant.parse(null, rest.join(' '), null, null));
                this._id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, step);
                return GLib.SOURCE_REMOVE;
            }
            if (q.startsWith('<set ')) {   // <set key=gvariant> changes a Eureka setting for the next steps
                const body = q.slice(5, -1), cut = body.indexOf('=');
                const [key, value] = [body.slice(0, cut), body.slice(cut + 1)];
                Main.extensionManager.lookup('eureka@shahriyar31.github.io').stateObj._settings
                    .set_value(key, GLib.Variant.parse(null, value, null, null));
                p.close();
                this._id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, step);
                return GLib.SOURCE_REMOVE;
            }
            if (!p.isOpen)
                p.open();
            p._entry.set_text(q === '<empty>' ? '' : q);
            this._id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, () => {
                console.log(`DEVTEST "${q}" -> ${p._results.map(r => `${r.section}:${r.title}`).join(' | ') || '(none)'}`);
                const b = p._box, bd = p._backdrop;
                console.log(`DEVTEST   panel: open=${p.isOpen} mapped=${b?.mapped} opacity=${b?.opacity} backdropOpacity=${bd?.opacity} ` +
                    `scale=${b?.scale_x?.toFixed(2)} fading=${p._fading?.size} panelBottom=${Math.round((b?.get_transformed_position()[1] ?? 0) + (b?.height ?? 0))} screenBottom=${Main.layoutManager.primaryMonitor.y + Main.layoutManager.primaryMonitor.height}`);
                shoot(q.replace(/[^a-z0-9]+/gi, '_').slice(0, 20) || 'empty', () => {
                    this._id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, step);
                });
                return GLib.SOURCE_REMOVE;
            });
            return GLib.SOURCE_REMOVE;
        };
        this._id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, step);
    }

    disable() {
        if (this._id)
            GLib.source_remove(this._id);
    }
}
