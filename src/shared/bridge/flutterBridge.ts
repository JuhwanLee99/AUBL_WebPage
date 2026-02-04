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
    };

function postToFlutterBridge(payload: FlutterBridgeMessage) {
  if (typeof window === 'undefined') return;
  const bridge = window.FlutterBridge;
  if (!bridge || typeof bridge.postMessage !== 'function') return;
  bridge.postMessage(JSON.stringify(payload));
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
