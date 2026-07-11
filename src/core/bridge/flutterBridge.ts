import { getIdToken } from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  FLUTTER_BRIDGE_MESSAGE_TYPES,
  type FlutterBridgeMessage,
} from '@core/contracts/flutterBridge';

type FlutterBridgeHandle = {
  postMessage: (message: string) => void;
};

function resolveFlutterBridge(): FlutterBridgeHandle | null {
  if (typeof window === 'undefined') return null;
  const direct = window.FlutterBridge;
  if (direct && typeof direct.postMessage === 'function') return direct;
  const webkit = window.webkit?.messageHandlers?.FlutterBridge;
  if (webkit && typeof webkit.postMessage === 'function') {
    return {
      postMessage: (message: string) => webkit.postMessage(message),
    };
  }
  return null;
}

function postToFlutterBridge(payload: FlutterBridgeMessage): boolean {
  const bridge = resolveFlutterBridge();
  if (!bridge) return false;
  bridge.postMessage(JSON.stringify(payload));
  return true;
}

export function hasFlutterBridge(): boolean {
  return resolveFlutterBridge() != null;
}

export async function sendLoginSuccessToFlutter(user: User, idToken?: string) {
  const token = idToken ?? (await getIdToken(user, true));
  postToFlutterBridge({
    type: FLUTTER_BRIDGE_MESSAGE_TYPES.loginSuccess,
    idToken: token,
    uid: user.uid,
    email: user.email,
  });
}

export async function sendTokenRefreshToFlutter(user: User, idToken?: string) {
  const token = idToken ?? (await getIdToken(user, true));
  postToFlutterBridge({
    type: FLUTTER_BRIDGE_MESSAGE_TYPES.tokenRefresh,
    idToken: token,
  });
}

export function sendLogoutToFlutter() {
  postToFlutterBridge({ type: FLUTTER_BRIDGE_MESSAGE_TYPES.logout });
}

export function requestNativeGoogleSignInFromFlutter() {
  return postToFlutterBridge({ type: FLUTTER_BRIDGE_MESSAGE_TYPES.requestNativeGoogle });
}
