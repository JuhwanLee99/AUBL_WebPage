import 'dart:async';

import 'package:aubl_flutter_app/core/services/notification_service.dart';
import 'package:aubl_flutter_app/main.dart' as app;
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('first frame is shown while push initialization is pending', (
    tester,
  ) async {
    final pending = Completer<void>();
    var initializationCalls = 0;
    app.runAppWithNotifications(
      app: const MaterialApp(home: Scaffold(body: Text('AUBL 홈'))),
      initializeNotifications: () {
        initializationCalls++;
        return pending.future;
      },
    );
    expect(initializationCalls, 0);
    await tester.pump();
    expect(find.text('AUBL 홈'), findsOneWidget);
    expect(initializationCalls, 1);
    expect(pending.isCompleted, isFalse);
    pending.complete();
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  group('notification startup', () {
    late _MessagingFake messaging;
    late _LocalFake local;
    late StreamController<RemoteMessage> opened;
    late NotificationService service;

    setUp(() {
      SharedPreferences.setMockInitialValues({});
      messaging = _MessagingFake();
      local = _LocalFake();
      opened = StreamController<RemoteMessage>.broadcast();
      service = NotificationService.testing(
        messaging: messaging,
        local: local,
        platform: TargetPlatform.iOS,
        foregroundMessages: const Stream<RemoteMessage>.empty(),
        openedMessages: opened.stream,
        operationTimeout: const Duration(milliseconds: 40),
      );
    });

    tearDown(() async {
      await opened.close();
      await messaging.tokenRefresh.close();
    });

    test(
      'concurrent init installs callbacks once and keeps early navigation',
      () async {
        messaging.initial.complete(
          const RemoteMessage(data: {'nav_type': 'match'}),
        );
        final first = service.init();
        final second = service.init();
        expect(identical(first, second), isTrue);
        await first;
        expect(local.initializeCalls, 1);
        expect(messaging.initialCalls, 1);
        expect(service.consumePendingNav(), 'match');
        expect(service.consumePendingNav(), isNull);
      },
    );

    test(
      'late initial message reaches the shell stream while token waits',
      () async {
        messaging.token = Completer<String?>();
        final startup = service.init();
        final received = <String>[];
        final subscription = service.navigationStream.listen(received.add);
        addTearDown(subscription.cancel);
        messaging.initial.complete(
          const RemoteMessage(data: {'nav_type': 'notice'}),
        );
        opened.add(const RemoteMessage(data: {'nav_type': 'match'}));
        await Future<void>.delayed(Duration.zero);
        expect(received, containsAllInOrder(['notice', 'match']));
        expect(service.consumePendingNav(), isNull);
        messaging.token!.complete(null);
        await startup;
      },
    );

    test(
      'unresponsive topic registration cannot keep startup pending',
      () async {
        messaging.initial.complete(null);
        messaging.token = Completer<String?>()..complete('test-token');
        messaging.blockTopics = true;
        await service.init().timeout(const Duration(milliseconds: 300));
        expect(messaging.subscribed, contains('community_urgent'));
      },
    );

    test(
      'token refresh reapplies stored disabled preference without enabling topics',
      () async {
        SharedPreferences.setMockInitialValues({
          'notif_all_enabled': false,
          'notif_team_id': '7',
          'notif_user_uid': 'test-user',
        });
        messaging.initial.complete(null);
        await service.init();
        messaging.tokenRefresh.add('refreshed-test-token');
        await Future<void>.delayed(const Duration(milliseconds: 10));
        expect(messaging.subscribed, isEmpty);
        expect(
          messaging.unsubscribed,
          containsAll([
            'community_urgent',
            'community_notices',
            'matches_all',
            'team_7_notices',
            'team_7_matches',
            'inquiry_test-user',
          ]),
        );
      },
    );

    test(
      'OFF wins after an earlier subscribe completes beyond the timeout',
      () async {
        messaging.initial.complete(null);
        messaging.token = Completer<String?>()..complete('test-token');
        messaging.delayedTopic = 'community_urgent';
        messaging.delayedSubscription = Completer<void>();
        await service.init();
        await service.setAllNotificationsEnabled(false);
        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getBool('notif_all_enabled'), isFalse);
        expect(messaging.delayedSubscription!.isCompleted, isFalse);
        expect(messaging.maxNativeCalls, 1);

        messaging.delayedSubscription!.complete();
        await Future<void>.delayed(const Duration(milliseconds: 15));
        expect(messaging.activeTopics, isEmpty);
        expect(messaging.unsubscribed, contains('community_urgent'));
        expect(messaging.maxNativeCalls, 1);
      },
    );

    test(
      'logout removes a late inquiry subscription and retains pending cleanup',
      () async {
        SharedPreferences.setMockInitialValues({
          'notif_user_uid': 'previous-user',
        });
        messaging.initial.complete(null);
        messaging.token = Completer<String?>()..complete('test-token');
        messaging.delayedTopic = 'inquiry_previous-user';
        messaging.delayedSubscription = Completer<void>();
        await service.init();
        expect(messaging.subscribed, contains('inquiry_previous-user'));
        await service.updateUserInquiryTopic(null);
        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getString('notif_user_uid'), isNull);
        expect(
          prefs.getStringList('notif_pending_topic_cleanup_v1'),
          contains('inquiry_previous-user'),
        );

        messaging.delayedSubscription!.complete();
        await Future<void>.delayed(const Duration(milliseconds: 15));
        expect(
          messaging.activeTopics,
          isNot(contains('inquiry_previous-user')),
        );
        expect(messaging.unsubscribed, contains('inquiry_previous-user'));
        expect(prefs.getStringList('notif_pending_topic_cleanup_v1'), isEmpty);
        expect(messaging.maxNativeCalls, 1);
      },
    );
  });
}

class _MessagingFake extends Fake implements FirebaseMessaging {
  final initial = Completer<RemoteMessage?>();
  final tokenRefresh = StreamController<String>.broadcast();
  Completer<String?>? token;
  int initialCalls = 0;
  bool blockTopics = false;
  String? delayedTopic;
  Completer<void>? delayedSubscription;
  final activeTopics = <String>{};
  int _nativeCalls = 0;
  int maxNativeCalls = 0;
  final subscribed = <String>[];
  final unsubscribed = <String>[];

  @override
  Stream<String> get onTokenRefresh => tokenRefresh.stream;

  @override
  Future<RemoteMessage?> getInitialMessage() {
    initialCalls++;
    return initial.future;
  }

  @override
  Future<void> setAutoInitEnabled(bool enabled) async {}

  @override
  Future<NotificationSettings> requestPermission({
    bool alert = true,
    bool announcement = false,
    bool badge = true,
    bool carPlay = false,
    bool criticalAlert = false,
    bool provisional = false,
    bool providesAppNotificationSettings = false,
    bool sound = true,
  }) async => const NotificationSettings(
    alert: AppleNotificationSetting.enabled,
    announcement: AppleNotificationSetting.disabled,
    authorizationStatus: AuthorizationStatus.authorized,
    badge: AppleNotificationSetting.enabled,
    carPlay: AppleNotificationSetting.disabled,
    criticalAlert: AppleNotificationSetting.disabled,
    lockScreen: AppleNotificationSetting.enabled,
    notificationCenter: AppleNotificationSetting.enabled,
    providesAppNotificationSettings: AppleNotificationSetting.disabled,
    showPreviews: AppleShowPreviewSetting.always,
    sound: AppleNotificationSetting.enabled,
    timeSensitive: AppleNotificationSetting.disabled,
  );

  @override
  Future<void> setForegroundNotificationPresentationOptions({
    bool alert = false,
    bool badge = false,
    bool sound = false,
  }) async {}

  @override
  Future<String?> getAPNSToken() async => 'test-apns-token';

  @override
  Future<String?> getToken({String? vapidKey}) =>
      token?.future ?? Future<String?>.value(null);

  @override
  Future<void> subscribeToTopic(String topic) async {
    subscribed.add(topic);
    _nativeCalls++;
    if (_nativeCalls > maxNativeCalls) maxNativeCalls = _nativeCalls;
    try {
      if (blockTopics) await Completer<void>().future;
      if (topic == delayedTopic) await delayedSubscription!.future;
      activeTopics.add(topic);
    } finally {
      _nativeCalls--;
    }
  }

  @override
  Future<void> unsubscribeFromTopic(String topic) async {
    unsubscribed.add(topic);
    _nativeCalls++;
    if (_nativeCalls > maxNativeCalls) maxNativeCalls = _nativeCalls;
    activeTopics.remove(topic);
    _nativeCalls--;
  }
}

class _LocalFake extends Fake implements FlutterLocalNotificationsPlugin {
  int initializeCalls = 0;

  @override
  Future<bool?> initialize({
    required InitializationSettings settings,
    DidReceiveNotificationResponseCallback? onDidReceiveNotificationResponse,
    DidReceiveBackgroundNotificationResponseCallback?
    onDidReceiveBackgroundNotificationResponse,
  }) async {
    initializeCalls++;
    return true;
  }
}
