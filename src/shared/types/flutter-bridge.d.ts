export {};

declare global {
  interface Window {
    FlutterBridge?: {
      postMessage: (message: string) => void;
    };
    __flutterAuthInject?: (customToken: string) => Promise<void>;
    __flutterGetIdToken?: () => Promise<string | null>;
    webkit?: {
      messageHandlers?: {
        FlutterBridge?: {
          postMessage: (message: string) => void;
        };
      };
    };
  }
}
