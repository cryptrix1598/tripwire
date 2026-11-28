/**
 * Follow the browser's own text-size setting (Chrome's Settings, Appearance, Font size: Medium is
 * 16px, Large 20px, Very large 24px).
 *
 * Tripwire's screens are laid out in pixels so that a web page's own CSS can never shrink the pause
 * or the warning. That would also ignore a person who asked their browser for bigger text, so this
 * scales the whole interface to match. The CSS keyword `medium` always means that setting, whatever
 * the page around it says, and `!important` on an inline style beats any page rule. Browser zoom
 * (Ctrl and +) keeps working on top. Never smaller than designed, at most twice the size.
 */
export function followTextSize(el: HTMLElement): number {
  let px = 16;
  try {
    const probe = el.ownerDocument.createElement('span');
    for (const [k, v] of [['font-size', 'medium'], ['position', 'absolute'], ['visibility', 'hidden'], ['font-family', 'sans-serif']] as const) {
      probe.style.setProperty(k, v, 'important');
    }
    probe.textContent = 'x';
    el.append(probe);
    px = Number.parseFloat(getComputedStyle(probe).fontSize) || 16;
    probe.remove();
  } catch {
    return 1;
  }
  const scale = Math.round(Math.min(2, Math.max(1, px / 16)) * 100) / 100;
  if (scale > 1) el.style.setProperty('zoom', String(scale), 'important');
  // At 1.25x and above the two-column pause no longer fits a laptop screen: tripwire.css stacks it.
  if (scale >= 1.25) el.classList.add('tw-large-text');
  return scale;
}
