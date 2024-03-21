import { LitElement } from "lit";

import { theme } from "@/theme";

export class TailwindElement extends LitElement {
  connectedCallback(): void {
    super.connectedCallback();
    // Insert the compiled Tailwind css into the shadow root.
    // This has the benefit of not requiring a whole copy of compiled Tailwind
    // for every TailwindElement, so we still get the benefits of atomic CSS.
    // And because Tailwind uses `@layer`[^1], the order of declarations ends up
    // correct, and you can use component styles with `static styles = ...`,
    // *and* you can use Tailwind functions and directives in those styles
    // thanks to `postcss-lit`.
    //
    // [^1]: (see https://tailwindcss.com/docs/adding-custom-styles#using-css-and-layer),
    this.shadowRoot?.adoptedStyleSheets.push(theme);
  }
}
