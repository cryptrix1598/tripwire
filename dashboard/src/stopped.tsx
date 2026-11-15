/**
 * The "you stopped" page for the web demo: the extension's own page, given the
 * few extension APIs it asks for.
 */
(globalThis as unknown as { chrome: unknown }).chrome = {
  runtime: { getURL: (path: string) => path, sendMessage: async () => null },
  tabs: {
    getCurrent: async () => null,
    create: ({ url }: { url: string }) => {
      location.href = url;
    },
  },
};

void import('../../src/entrypoints/safe/main');

export {};
