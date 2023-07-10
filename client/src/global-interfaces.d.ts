import * as monaco from 'monaco-editor';


declare global {
  const navigation: any;

  interface Crypto {
    randomUUID(): string;
  }

  interface Document {
    adoptedStyleSheets: CSSStyleSheet[];
  }

  interface Keyboard {
    getLayoutMap(): Promise<KeyboardLayoutMap>;
  }

  interface KeyboardLayoutMap {
    get(code: string): string | undefined;
  }

  interface Navigator {
    keyboard: Keyboard;
  }

  interface Window {
    MonacoEnvironment?: monaco.Environment | undefined;
  }

  class URLPattern {
    constructor(options: any): URLPattern;
    exec(input: any): any;
  }
}
