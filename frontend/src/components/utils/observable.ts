import { html, LitElement } from "lit";
import { customElement, query } from "lit/decorators.js";

type IntersectionEventDetail = {
  entry: IntersectionObserverEntry;
};
export type IntersectEvent = CustomEvent<IntersectionEventDetail>;

/**
 * Observe element with Intersection Observer API.
 *
 * @example Usage:
 * ```
 * <btrix-observable @intersect=${console.log}>
 *   Observe me!
 * </btrix-observable>
 * ```
 *
 * @event intersect { entry: IntersectionObserverEntry }
 */
@customElement("btrix-observable")
export class Observable extends LitElement {
  @query(".target")
  private readonly target?: HTMLElement;

  private observer?: IntersectionObserver;

  connectedCallback(): void {
    super.connectedCallback();
    this.observer = new IntersectionObserver(this.handleIntersect);
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
  }

  firstUpdated() {
    this.observer?.observe(this.target!);
  }

  private readonly handleIntersect = ([entry]: IntersectionObserverEntry[]) => {
    this.dispatchEvent(
      new CustomEvent<IntersectionEventDetail>("intersect", {
        detail: { entry },
      }),
    );
  };

  render() {
    return html`<div class="target"><slot></slot></div>`;
  }
}
