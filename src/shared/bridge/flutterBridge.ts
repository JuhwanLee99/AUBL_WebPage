import { getIdToken } from 'firebase/auth';
import type { User } from 'firebase/auth';

type FlutterBridgeMessage =
  | {
      type: 'LOGIN_SUCCESS';
      idToken: string;
      uid: string;
      email: string | null;
    }
  | {
      type: 'TOKEN_REFRESH';
      idToken: string;
    }
  | {
      type: 'LOGOUT';
    }
  | {
      type: 'REQUEST_NATIVE_GOOGLE';
    };

function postToFlutterBridge(payload: FlutterBridgeMessage): boolean {
  if (typeof window === 'undefined') return false;
  const bridge = window.FlutterBridge;
  if (!bridge || typeof bridge.postMessage !== 'function') return false;
  bridge.postMessage(JSON.stringify(payload));
  return true;
}

export async function sendLoginSuccessToFlutter(user: User, idToken?: string) {
  const token = idToken ?? (await getIdToken(user, true));
  postToFlutterBridge({
    type: 'LOGIN_SUCCESS',
    idToken: token,
    uid: user.uid,
    email: user.email,
  });
}

export async function sendTokenRefreshToFlutter(user: User, idToken?: string) {
  const token = idToken ?? (await getIdToken(user, true));
  postToFlutterBridge({
    type: 'TOKEN_REFRESH',
    idToken: token,
  });
}

export function sendLogoutToFlutter() {
  postToFlutterBridge({ type: 'LOGOUT' });
}

export function requestNativeGoogleSignInFromFlutter() {
  return postToFlutterBridge({ type: 'REQUEST_NATIVE_GOOGLE' });
}
