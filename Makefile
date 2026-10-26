UUID := eureka@shahriyar31.github.io
SRC  := $(UUID)
ZIP  := $(UUID).shell-extension.zip

.PHONY: all schemas pack install uninstall lint pot clean test

all: pack

schemas:
	glib-compile-schemas --strict $(SRC)/schemas

# The zip for extensions.gnome.org: only the extension's own files, never dev/ or docs/.
pack: schemas
	rm -f $(ZIP)
	gnome-extensions pack $(SRC) --force --extra-source=theme.js --extra-source=shortcuts.js --extra-source=providers \
		--extra-source=../LICENSE --podir=../po --out-dir=.

# extensions.gnome.org compiles the schema itself (GNOME 46+ zips must not contain it); a manual install must do it here
install: pack
	gnome-extensions install --force $(ZIP)
	glib-compile-schemas $(HOME)/.local/share/gnome-shell/extensions/$(UUID)/schemas
	@echo "Installed. Log out and back in, then: gnome-extensions enable $(UUID)"

uninstall:
	gnome-extensions uninstall $(UUID)

# unit tests (maths, units, currency), file search against this computer's index, then real input in an isolated GNOME
test: schemas
	gjs -m dev/test-unit.mjs
	gjs -m dev/test-files.mjs
	dev/smoke-test.sh

lint:
	npx --yes eslint@9 .

pot:
	xgettext --from-code=UTF-8 --language=JavaScript --keyword=_ --package-name=eureka \
		-o po/eureka.pot $(SRC)/*.js $(SRC)/providers/*.js

clean:
	rm -f $(ZIP) $(SRC)/schemas/gschemas.compiled
