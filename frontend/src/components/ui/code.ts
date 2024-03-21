import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import xml from "highlight.js/lib/languages/xml";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import { TailwindElement } from "@/classes/TailwindElement";

/**
 * Syntax highlighting for javascript and HTML (XML)
 */
@customElement("btrix-code")
export class Code extends TailwindElement {
  static styles = css`
    .hljs-name {
      color: #22863a;
    }

    .hljs-attr {
      color: #6f42c1;
    }

    .hljs-string {
      color: #032f62;
    }
  `;

  @property({ type: String })
  value = "";

  @property({ type: String })
  language: "javascript" | "xml" = "xml";

  constructor() {
    super();
    hljs.registerLanguage("javascript", javascript);
    hljs.registerLanguage("xml", xml);
  }

  render() {
    const htmlStr = hljs.highlight(this.value, {
      language: this.language,
    }).value;
    return html`<pre
      class="font-monospace m-0 whitespace-pre-wrap text-neutral-800"
    ><code>${staticHtml`${unsafeStatic(htmlStr)}`}</code></pre>`;
  }
}
