// Minimal typings for the noVNC client (@novnc/novnc ships without TypeScript declarations).
declare module "@novnc/novnc" {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: { shared?: boolean; wsProtocols?: string[] });
    scaleViewport: boolean;
    resizeSession: boolean;
    clipViewport: boolean;
    viewOnly: boolean;
    background: string;
    disconnect(): void;
    focus(): void;
    clipboardPasteFrom(text: string): void;
  }
}
