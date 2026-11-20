export {};

declare global {
  interface Window {
    virtualOfficeDesktop?: {
      pickDirectory: () => Promise<string | null>;
    };
  }
}
