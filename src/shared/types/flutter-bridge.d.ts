export {};

declare global {
  interface Window {
    FlutterBridge?: {
      postMessage: (message: string) => void;
    };
  }
}
