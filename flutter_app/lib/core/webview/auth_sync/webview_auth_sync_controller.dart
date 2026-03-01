import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../services/auth_bridge_service.dart';
import '../bridge/flutter_bridge_message.dart';
import 'webview_auth_scripts.dart';
import 'webview_auth_sync_state.dart';

class WebViewAuthSyncController {
  const WebViewAuthSyncController._();

  static bool _isTruthyJsResult(Object result) {
    final normalized = result.toString().trim().toLowerCase();
    return normalized == 'true' || normalized == '"true"' || normalized == '1';
  }

  static void seedFromCurrentUser(User? user, WebViewAuthSyncState syncState) {
    if (user == null) return;
    syncState.setInitialObservedUid(user.uid);
  }

  static StreamSubscription<User?> bindAuthState({
    required FirebaseAuth auth,
    required WebViewAuthSyncState syncState,
    required Future<void> Function() onRequireInject,
  }) {
    return auth.authStateChanges().listen((user) {
      if (user == null) {
        syncState.clearObservedUid();
        return;
      }
      if (syncState.shouldSkipObservedUid(user.uid)) return;
      syncState.markObservedUid(user.uid);
      unawaited(onRequireInject());
    });
  }

  static Future<void> handleBridgeMessage({
    required String rawMessage,
    required Future<void> Function(String webIdToken) onWebToken,
    required Future<void> Function() onLogout,
    required Future<void> Function() onRequestNativeGoogle,
  }) async {
    final payload = FlutterBridgeMessage.fromRaw(rawMessage);
    switch (payload.type) {
      case BridgeMessageType.loginSuccess:
      case BridgeMessageType.tokenRefresh:
        final idToken = payload.idToken;
        if (idToken != null && idToken.isNotEmpty) {
          await onWebToken(idToken);
        }
        return;
      case BridgeMessageType.logout:
        await onLogout();
        return;
      case BridgeMessageType.requestNativeGoogle:
        await onRequestNativeGoogle();
        return;
      case BridgeMessageType.unknown:
        return;
    }
  }

  static Future<void> injectAuthIfNeeded({
    required FirebaseAuth auth,
    required AuthBridgeService authBridgeService,
    required WebViewController controller,
    required WebViewAuthSyncState syncState,
    String? redirectUrl,
  }) async {
    final user = auth.currentUser;
    if (user == null) return;
    final idToken = await user.getIdToken();
    if (idToken == null || idToken.isEmpty) return;
    final skipRedundantInjection = syncState.shouldSkipInjection(
      uid: user.uid,
      idToken: idToken,
      redirectUrl: redirectUrl,
    );
    if (skipRedundantInjection) return;
    final customToken = await authBridgeService.exchangeWebIdToken(idToken);
    final injected = await controller.runJavaScriptReturningResult(
      WebViewAuthScripts.buildInjectCustomToken(
        customToken: customToken,
        redirectUrl: redirectUrl,
      ),
    );
    if (!_isTruthyJsResult(injected)) {
      throw AuthBridgeException('웹 인증 주입 실패: inject 함수 실행 결과가 false 입니다.');
    }
    syncState.markInjected(uid: user.uid, idToken: idToken);
  }

  static Future<void> requestWebIdTokenIfNeeded({
    required FirebaseAuth auth,
    required WebViewController controller,
  }) async {
    if (auth.currentUser != null) return;
    await controller.runJavaScript(WebViewAuthScripts.probeWebIdToken);
  }

  static Future<void> signInWithWebToken({
    required String webIdToken,
    required FirebaseAuth auth,
    required AuthBridgeService authBridgeService,
    required WebViewAuthSyncState syncState,
  }) async {
    if (syncState.shouldSkipConsumedWebIdToken(webIdToken)) return;
    final customToken = await authBridgeService.exchangeWebIdToken(webIdToken);
    await auth.signInWithCustomToken(customToken);
    syncState.markConsumedWebIdToken(webIdToken);
  }
}
