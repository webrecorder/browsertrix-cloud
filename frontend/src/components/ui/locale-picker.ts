import { localized } from "@lit/localize";
import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

import { allLocales } from "@/__generated__/locale-codes";
import { getLocale, setLocaleFromUrl } from "@/utils/localization";

type LocaleCode = (typeof allLocales)[number];
type LocaleNames = {
  [L in LocaleCode]: string;
};

@localized()
@customElement("btrix-locale-picker")
export class LocalePicker extends LitElement {
  @state()
  private localeNames: LocaleNames | undefined = {} as LocaleNames;

  private readonly setLocaleName = (locale: LocaleCode) => {
    this.localeNames![locale] = new Intl.DisplayNames([locale], {
      type: "language",
    }).of(locale)!;
  };

  async firstUpdated() {
    this.localeNames = {} as LocaleNames;
    allLocales.forEach(this.setLocaleName);
  }

  render() {
    if (!this.localeNames) {
      return;
    }

    const selectedLocale = getLocale();

    return html`
      <sl-dropdown
        value="${selectedLocale}"
        @sl-select=${this.localeChanged}
        placement="top-end"
        distance="4"
        hoist
      >
        <sl-button slot="trigger" size="small" caret
          >${this.localeNames[selectedLocale as LocaleCode]}</sl-button
        >
        <sl-menu>
          ${allLocales.map(
            (locale) =>
              html`<sl-menu-item
                type="checkbox"
                value=${locale}
                ?checked=${locale === selectedLocale}
              >
                ${this.localeNames![locale]}
              </sl-menu-item>`,
          )}
        </sl-menu>
      </sl-dropdown>
    `;
  }

  async localeChanged(event: CustomEvent) {
    const newLocale = event.detail.item.value as LocaleCode;

    if (newLocale !== getLocale()) {
      const url = new URL(window.location.href);
      url.searchParams.set("locale", newLocale);
      window.history.pushState(null, "", url.toString());
      void setLocaleFromUrl();
    }
  }
}
