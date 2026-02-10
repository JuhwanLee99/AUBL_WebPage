import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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

  await SystemChrome.setEnabledSystemUIMode(
    SystemUiMode.manual,
    overlays: SystemUiOverlay.values,
  );
  SystemChrome.setSystemUIOverlayStyle(AppTheme.systemUiStyle);

  // 한국어 로케일 초기화
  await initializeDateFormatting('ko');
  timeago.setLocaleMessages('ko', timeago.KoMessages());

  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(
    _firebaseMessagingBackgroundHandler,
  );
  await NotificationService.instance.init();

  final prefs = await SharedPreferences.getInstance();
  runApp(AublApp(prefs: prefs));
}
