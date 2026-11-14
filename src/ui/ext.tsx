/** Helpers for the extension's own pages (not the content script, not the dashboard). */
import './fonts.css';
import './tripwire.css';
import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { send, type StatusReply } from '../messaging';

export function mount(node: ReactNode): void {
  const el = document.getElementById('root');
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
