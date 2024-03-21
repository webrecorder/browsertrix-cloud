import { css, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import { micromark } from "micromark";
import {
  gfmStrikethrough,
  gfmStrikethroughHtml,
} from "micromark-extension-gfm-strikethrough";

import { typography } from "@/utils/css";

/**
 * View rendered markdown
 */
@customElement("btrix-markdown-viewer")
export class MarkdownViewer extends LitElement {
  static styles = [
    typography,
    css`
      a {
        color: var(--primary);
      }

      a:hover,
      a:active {
        text-decoration: none;
      }

      img {
        max-width: 100%;
      }
    `,
  ];

  @property({ type: String })
  value = "";

  render() {
    return staticHtml`${unsafeStatic(
      micromark(this.value, {
        extensions: [gfmStrikethrough()],
        htmlExtensions: [gfmStrikethroughHtml()],
      }),
    )}`;
  }
}
