export {};

declare global {
  interface Window {
    FlutterBridge?: {
      postMessage: (message: string) => void;
    };
    webkit?: {
      messageHandlers?: {
        FlutterBridge?: {
          postMessage: (message: string) => void;
        };
      };
    };
  }
}
