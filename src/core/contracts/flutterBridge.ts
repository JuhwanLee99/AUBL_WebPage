export const FLUTTER_BRIDGE_MESSAGE_TYPES = {
  loginSuccess: 'LOGIN_SUCCESS',
  tokenRefresh: 'TOKEN_REFRESH',
  logout: 'LOGOUT',
  requestNativeGoogle: 'REQUEST_NATIVE_GOOGLE',
} as const;

export type FlutterBridgeMessageType =
  (typeof FLUTTER_BRIDGE_MESSAGE_TYPES)[keyof typeof FLUTTER_BRIDGE_MESSAGE_TYPES];

export type FlutterBridgeMessage =
  | {
      type: typeof FLUTTER_BRIDGE_MESSAGE_TYPES.loginSuccess;
      idToken: string;
      uid: string;
      email: string | null;
    }
  | {
      type: typeof FLUTTER_BRIDGE_MESSAGE_TYPES.tokenRefresh;
      idToken: string;
    }
  | {
      type: typeof FLUTTER_BRIDGE_MESSAGE_TYPES.logout;
    }
  | {
      type: typeof FLUTTER_BRIDGE_MESSAGE_TYPES.requestNativeGoogle;
    };

export const FLUTTER_BRIDGE_GLOBALS = {
  authInject: '__flutterAuthInject',
  getIdToken: '__flutterGetIdToken',
} as const;
