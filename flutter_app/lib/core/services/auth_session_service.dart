import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'notification_service.dart';

class AuthSessionService {
  const AuthSessionService._();

  /// 로그아웃 UI 반응 속도를 위해 Firebase 세션은 즉시 종료하고,
  /// 나머지 정리 작업(구글/쿠키/알림 토픽)은 백그라운드에서 처리한다.
  static Future<void> signOutFast({bool clearWebViewCookies = true}) async {
    await FirebaseAuth.instance.signOut();
    unawaited(
      _runPostSignOutCleanup(clearWebViewCookies: clearWebViewCookies),
    );
  }

  static Future<void> _runPostSignOutCleanup({
    required bool clearWebViewCookies,
  }) async {
    await Future.wait([
      _safeVoid(
          () => NotificationService.instance.updateUserInquiryTopic(null)),
      _safeVoid(() => GoogleSignIn.instance.signOut()),
      if (clearWebViewCookies)
        _safeBool(() => WebViewCookieManager().clearCookies()),
    ]);
  }

  static Future<void> _safeVoid(Future<void> Function() action) async {
    try {
      await action().timeout(const Duration(seconds: 2));
    } catch (_) {}
  }

  static Future<void> _safeBool(Future<bool> Function() action) async {
    try {
      await action().timeout(const Duration(seconds: 2));
    } catch (_) {}
  }
}
