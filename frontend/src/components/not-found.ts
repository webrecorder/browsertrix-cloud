import { localized, msg } from "@lit/localize";
import { html, LitElement } from "lit";
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
