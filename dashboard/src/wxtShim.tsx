/**
 * Stand-ins for the two WXT helpers the content script uses, so the very same
 * content-script code can run as a plain web script on the hosted practice
 * pages (see demoRuntime.tsx). Only the dashboard build aliases `#imports` here.
 */
import css from '../../src/ui/tripwire.css?inline';

export interface ContentScriptContext {
  isValid: boolean;
  addEventListener(target: EventTarget, type: string, handler: (event: Event) => void, options?: AddEventListenerOptions | boolean): void;
  onInvalidated(callback: () => void): void;
}

export function defineContentScript<T>(definition: T): T {
  return definition;
}

export async function createShadowRootUi<T>(
  _ctx: ContentScriptContext,
  options: { name: string; onMount: (container: HTMLElement, shadow: ShadowRoot, host: HTMLElement) => T; onRemove?: (mounted?: T) => void },
) {
  const host = document.createElement(options.name);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  // Same isolation the extension gets: the page's own styles do not leak in.
  style.textContent = `:host{all:initial!important}${css}`;
  const container = document.createElement('div');
  shadow.append(style, container);
  let mounted: T | undefined;
  return {
    shadowHost: host,
    shadow,
    mount() {
      document.body.append(host);
      mounted = options.onMount(container, shadow, host);
    },
    remove() {
      options.onRemove?.(mounted);
      host.remove();
    },
  };
}
