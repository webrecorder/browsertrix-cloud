import { localized, msg } from "@lit/localize";
import type { SlSelectEvent } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { type QARun } from "@/types/qa";

export type SelectDetail = { item: { id: string } };

// NOTE <sl-format-date> seems to prevent sl-select event, needs investigation
function formatDate(date: string) {
  return new Date(`${date}Z`).toLocaleDateString(undefined, {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * @fires btrix-select
 */
@localized()
@customElement("btrix-qa-run-dropdown")
export class QaRunDropdown extends TailwindElement {
  @property({ type: Array })
  items: QARun[] = [];

  @property({ type: String })
  selectedId?: string;

  render() {
    if (!this.items.length) return;

    const selectedRun = this.selectedId
      ? this.items.find(({ id }) => id === this.selectedId)
      : null;

    return html`
      <sl-dropdown @sl-select=${this.onSelect} distance="-2">
        <sl-button slot="trigger" variant="text" size="small" caret>
          ${selectedRun
            ? formatDate(selectedRun.finished)
            : msg("Select a QA run")}
        </sl-button>
        <sl-menu>
          ${this.items.map((run) => {
            const isSelected = selectedRun && run.id === selectedRun.id;
            return html`
              <sl-menu-item
                value=${run.id}
                type="checkbox"
                ?disabled=${isSelected}
                ?checked=${isSelected}
              >
                ${formatDate(run.finished)}
              </sl-menu-item>
            `;
          })}
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private onSelect(e: SlSelectEvent) {
    e.stopPropagation();

    const id = e.detail.item.value;

    this.dispatchEvent(
      new CustomEvent<SelectDetail>("btrix-select", {
        detail: { item: { id } },
      }),
    );
  }
}
