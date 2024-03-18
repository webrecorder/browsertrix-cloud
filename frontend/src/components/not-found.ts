import { msg, localized } from "@lit/localize";
import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("btrix-not-found")
@localized()
export class NotFound extends LitElement {
  createRenderRoot() {
    return this;
  }
  render() {
    return html`
      <div class="text-center text-xl text-gray-400">
        ${msg("Page not found")}
      </div>
    `;
  }
}
