/** Helpers for the extension's own pages (not the content script, not the dashboard). */
import './fonts.css';
import './tripwire.css';
import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { send, type StatusReply } from '../messaging';
import { applyLocale } from './locale';
import { followTextSize } from './textSize';

export function mount(node: ReactNode): void {
  try {
    document.documentElement.lang = applyLocale(chrome.i18n.getUILanguage());
  } catch {
    // Not in an extension context (the development gallery): stay in English.
  }
  const el = document.getElementById('root');
  // Bigger text if the person set their browser to it.
  followTextSize(document.documentElement);
  if (el) createRoot(el).render(node);
}

export async function closeThisTab(): Promise<void> {
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id !== undefined) return void (await chrome.tabs.remove(tab.id));
  } catch {
    /* fall through */
  }
  window.close();
}

export function openTab(url: string): void {
  void chrome.tabs.create({ url });
}

export function useStatus(): [StatusReply | null, () => void] {
  const [status, setStatus] = useState<StatusReply | null>(null);
  const refresh = () => void send<StatusReply>({ target: 'background', type: 'get-status' }).then(setStatus);
  useEffect(refresh, []);
  return [status, refresh];
}
