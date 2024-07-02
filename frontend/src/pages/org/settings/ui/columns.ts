/**
 * Render helpers for 2-column layout with info text
 */
import { html, type TemplateResult } from "lit";

import { tw } from "@/utils/tailwind";

export function columns(
  cols: [TemplateResult<1>, TemplateResult<1> | string][],
) {
  return html`
    <div class="grid grid-cols-5 gap-5 p-5">
      ${cols.map(
        ([main, info]) => html`
          <div class=${tw`col-span-5 self-baseline md:col-span-3`}>${main}</div>
          <div class="col-span-5 mb-6 flex gap-2 md:col-span-2 md:mb-0 md:mt-8">
            <div class="text-base">
              <sl-icon name="info-circle"></sl-icon>
            </div>
            <div class="mt-0.5 text-xs text-neutral-500">${info}</div>
          </div>
        `,
      )}
    </div>
  `;
}
