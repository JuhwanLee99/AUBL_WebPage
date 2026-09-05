import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timeago/timeago.dart' as timeago;

import 'app/app.dart';
import 'core/services/notification_service.dart';
import 'core/theme/app_theme.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  SystemChrome.setSystemUIOverlayStyle(
    AppTheme.systemUiStyleFor(
      WidgetsBinding.instance.platformDispatcher.platformBrightness,
    ),
  );

  // 한국어 로케일 초기화
  await initializeDateFormatting('ko');
  timeago.setLocaleMessages('ko', timeago.KoMessages());

  await Firebase.initializeApp();
  await GoogleSignIn.instance.initialize(
    serverClientId:
        '74667071214-c0iq29sa6fkf2gah8bf0nah4i6ptrvlf.apps.googleusercontent.com',
  );
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  final prefs = await SharedPreferences.getInstance();
  runAppWithNotifications(
    app: AublApp(prefs: prefs),
    initializeNotifications: NotificationService.instance.init,
  );
}

/// Native push registration can wait for APNs or the network indefinitely.
/// Draw the app before starting optional notification setup.
void runAppWithNotifications({
  required Widget app,
  required Future<void> Function() initializeNotifications,
}) {
  runApp(app);
  WidgetsBinding.instance.addPostFrameCallback((_) {
    unawaited(() async {
      try {
        await initializeNotifications();
      } catch (_) {
        debugPrint('[NotificationService] Notification setup unavailable.');
      }
    }());
  });
}
