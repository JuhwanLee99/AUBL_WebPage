import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum MatchNotifyPreference { all, team, off }

class NotificationService {
  NotificationService._({
    FirebaseMessaging? messaging,
    FlutterLocalNotificationsPlugin? local,
    TargetPlatform? platform,
    Stream<RemoteMessage>? foregroundMessages,
    Stream<RemoteMessage>? openedMessages,
    Duration operationTimeout = const Duration(seconds: 10),
  }) : _messaging = messaging ?? FirebaseMessaging.instance,
       _local = local ?? FlutterLocalNotificationsPlugin(),
       _platform = platform,
       _foregroundMessages = foregroundMessages,
       _openedMessages = openedMessages,
       _operationTimeout = operationTimeout;

  @visibleForTesting
  factory NotificationService.testing({
    required FirebaseMessaging messaging,
    required FlutterLocalNotificationsPlugin local,
    required TargetPlatform platform,
    required Stream<RemoteMessage> foregroundMessages,
    required Stream<RemoteMessage> openedMessages,
    Duration operationTimeout = const Duration(seconds: 10),
  }) => NotificationService._(
    messaging: messaging,
    local: local,
    platform: platform,
    foregroundMessages: foregroundMessages,
    openedMessages: openedMessages,
    operationTimeout: operationTimeout,
  );

  static final NotificationService instance = NotificationService._();

  static const String _teamKey = 'notif_team_id';
  static const String _userUidKey = 'notif_user_uid';
  static const String _matchPrefKey = 'notif_match_pref';
  static const String _allNotificationsKey = 'notif_all_enabled';
  static const String _communityNoticeKey = 'notif_community_notice';
  static const String _teamNoticeKey = 'notif_team_notice';
  static const String _inquiryNotifKey = 'notif_inquiry';
  static const String _pendingTopicCleanupKey =
      'notif_pending_topic_cleanup_v1';
  static const String _topicCommunityUrgent = 'community_urgent';
  static const String _topicCommunityNotices = 'community_notices';
  static const String _topicMatchesAll = 'matches_all';
  static const String _channelId = 'aubl_default';
  static const String _androidSmallIcon = 'ic_stat_aubl';

  final FirebaseMessaging _messaging;
  final FlutterLocalNotificationsPlugin _local;
  final TargetPlatform? _platform;
  final Stream<RemoteMessage>? _foregroundMessages;
  final Stream<RemoteMessage>? _openedMessages;
  final Duration _operationTimeout;
  Future<void>? _initialization;
  Future<void>? _subscriptionDrain;
  bool _subscriptionsDirty = false;
  final Set<String> _retiredTopics = {};
  bool get _isIOS =>
      _platform == null ? Platform.isIOS : _platform == TargetPlatform.iOS;
  bool get _isAndroid => _platform == null
      ? Platform.isAndroid
      : _platform == TargetPlatform.android;
  bool get _isPushSupportedPlatform => _isAndroid || _isIOS;

  // ── 알림 탭 네비게이션 ──
  final _navController = StreamController<String>.broadcast();
  String? _pendingNav;

  /// 알림 탭 시 발행되는 nav_type 스트림.
  /// MainShell에서 구독해 탭 전환에 활용.
  Stream<String> get navigationStream => _navController.stream;

  /// 앱 종료 후 알림 탭으로 시작된 경우 저장된 nav_type을 반환하고 초기화.
  String? consumePendingNav() {
    final nav = _pendingNav;
    _pendingNav = null;
    return nav;
  }

  void _dispatchNav(String navType) {
    if (navType.isEmpty) return;
    if (_navController.hasListener) {
      _navController.add(navType);
    } else {
      _pendingNav = navType;
    }
  }

  Future<void> init() => _initialization ??= _initialize();

  Future<void> _initialize() async {
    if (!_isPushSupportedPlatform) return;

    // Route taps before permission prompts, APNs registration, or topic work.
    (_foregroundMessages ?? FirebaseMessaging.onMessage).listen((message) {
      unawaited(
        _runSafely(
          'foreground notification',
          () => _handleForegroundMessage(message),
        ),
      );
    }, onError: (Object _) {});
    (_openedMessages ?? FirebaseMessaging.onMessageOpenedApp).listen((message) {
      final navType = message.data['nav_type'];
      if (navType is String) _dispatchNav(navType);
    }, onError: (Object _) {});
    unawaited(
      _runSafely('initial notification', () async {
        final message = await _messaging.getInitialMessage();
        final navType = message?.data['nav_type'];
        if (navType is String) _dispatchNav(navType);
      }),
    );
    _messaging.onTokenRefresh.listen((_) {
      unawaited(
        _runSafely('notification subscriptions', _syncStoredSubscriptions),
      );
    }, onError: (Object _) {});

    await _runSafely('local notification setup', _initializeLocalNotifications);
    await _runSafely(
      'push registration',
      () => _messaging.setAutoInitEnabled(true),
    );
    await _runSafely('notification permission', () async {
      await _messaging.requestPermission(alert: true, badge: true, sound: true);
    });
    if (_isAndroid) {
      await _runSafely('Android notification permission', () async {
        await _local
            .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin
            >()
            ?.requestNotificationsPermission();
      });
    }
    if (_isIOS) {
      await _runSafely(
        'foreground presentation',
        () => _messaging.setForegroundNotificationPresentationOptions(
          alert: true,
          badge: true,
          sound: true,
        ),
      );
    }

    await _runSafely('initial token registration', () async {
      if (_isIOS) {
        final apnsToken = await _waitForApnsToken();
        if (apnsToken == null || apnsToken.isEmpty) return;
      }
      final token = await _safeGetFcmToken();
      if (token == null || token.isEmpty) return;
      await _syncStoredSubscriptions();
    });
  }

  Future<void> _syncStoredSubscriptions() async {
    final prefs = await SharedPreferences.getInstance();
    await _syncSubscriptions(prefs);
  }

  Future<void> _runSafely(
    String operation,
    Future<void> Function() action,
  ) async {
    try {
      await action().timeout(_operationTimeout);
    } catch (_) {
      // Never log platform error payloads, tokens, user IDs, or notification text.
      debugPrint('[NotificationService] $operation unavailable.');
    }
  }

  Future<void> _initializeLocalNotifications() async {
    const initSettings = InitializationSettings(
      android: AndroidInitializationSettings('@drawable/ic_stat_aubl'),
      iOS: DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      ),
    );
    await _local.initialize(
      settings: initSettings,
      onDidReceiveNotificationResponse: (details) {
        // 포그라운드 로컬 알림 탭 처리
        final payload = details.payload;
        if (payload == null) return;
        try {
          final map = jsonDecode(payload) as Map<String, dynamic>;
          final navType = map['nav_type'] as String? ?? '';
          _dispatchNav(navType);
        } catch (_) {}
      },
    );

    if (_isAndroid) {
      const channel = AndroidNotificationChannel(
        _channelId,
        'AUBL 알림',
        description: '경기 및 공지 알림',
        importance: Importance.high,
      );
      await _local
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >()
          ?.createNotificationChannel(channel);
    }
  }

  Future<String?> _waitForApnsToken({
    int maxAttempts = 20,
    Duration delay = const Duration(milliseconds: 500),
  }) async {
    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      final token = await _messaging.getAPNSToken();
      if (token != null && token.isNotEmpty) {
        return token;
      }
      await Future<void>.delayed(delay);
    }
    return null;
  }

  Future<String?> _safeGetFcmToken() async {
    try {
      return await _messaging.getToken();
    } catch (_) {
      debugPrint('[NotificationService] FCM token unavailable.');
      return null;
    }
  }

  Future<MatchNotifyPreference> getMatchPreference() async {
    final prefs = await SharedPreferences.getInstance();
    return _readMatchPreference(prefs);
  }

  Future<bool> getAllNotificationsEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return _readBoolPref(prefs, _allNotificationsKey, true);
  }

  Future<bool> getCommunityNoticeEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return _readBoolPref(prefs, _communityNoticeKey, true);
  }

  Future<bool> getTeamNoticeEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return _readBoolPref(prefs, _teamNoticeKey, true);
  }

  Future<bool> getInquiryNotifEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return _readBoolPref(prefs, _inquiryNotifKey, true);
  }

  Future<void> setAllNotificationsEnabled(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_allNotificationsKey, enabled);
    await _syncSubscriptions(prefs);
  }

  Future<void> setCommunityNoticeEnabled(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_communityNoticeKey, enabled);
    await _syncSubscriptions(prefs);
  }

  Future<void> setTeamNoticeEnabled(bool enabled, {String? teamId}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_teamNoticeKey, enabled);
    if (teamId != null) await _storeTopicIdentity(prefs, _teamKey, teamId);
    await _syncSubscriptions(prefs);
  }

  Future<void> setInquiryNotifEnabled(bool enabled, {String? uid}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_inquiryNotifKey, enabled);
    if (uid != null) await _storeTopicIdentity(prefs, _userUidKey, uid);
    await _syncSubscriptions(prefs);
  }

  Future<void> setMatchPreference(
    MatchNotifyPreference pref, {
    String? teamId,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_matchPrefKey, pref.name);
    if (teamId != null) await _storeTopicIdentity(prefs, _teamKey, teamId);
    await _syncSubscriptions(prefs);
  }

  Future<void> updateTeamSubscriptions(String? teamId) async {
    final prefs = await SharedPreferences.getInstance();
    await _storeTopicIdentity(prefs, _teamKey, teamId);
    await _syncSubscriptions(prefs);
  }

  /// 로그인/로그아웃 시 호출 — uid가 null이면 구독 해제
  Future<void> updateUserInquiryTopic(String? uid) async {
    final prefs = await SharedPreferences.getInstance();
    await _storeTopicIdentity(prefs, _userUidKey, uid);
    await _syncSubscriptions(prefs);
  }

  Future<void> _storeTopicIdentity(
    SharedPreferences prefs,
    String key,
    String? value,
  ) async {
    final previous = prefs.getString(key);
    _retiredTopics.addAll(prefs.getStringList(_pendingTopicCleanupKey) ?? []);
    if (previous != null && previous.isNotEmpty && previous != value) {
      _retiredTopics.addAll(
        key == _teamKey
            ? ['team_${previous}_notices', 'team_${previous}_matches']
            : ['inquiry_$previous'],
      );
    }
    // Store the new identity before any native work can wait on the network.
    final persistIdentity = value != null && value.isNotEmpty
        ? prefs.setString(key, value)
        : prefs.remove(key);
    _subscriptionsDirty = true;
    await Future.wait([
      persistIdentity,
      prefs.setStringList(_pendingTopicCleanupKey, _retiredTopics.toList()),
    ]);
  }

  MatchNotifyPreference _readMatchPreference(SharedPreferences prefs) {
    final raw = prefs.getString(_matchPrefKey);
    return switch (raw) {
      'all' => MatchNotifyPreference.all,
      'off' => MatchNotifyPreference.off,
      _ => MatchNotifyPreference.team,
    };
  }

  bool _readBoolPref(SharedPreferences prefs, String key, bool fallback) {
    final value = prefs.getBool(key);
    return value ?? fallback;
  }

  Future<void> _syncSubscriptions(SharedPreferences prefs) async {
    if (!_isPushSupportedPlatform) return;
    _subscriptionsDirty = true;
    final drain = _subscriptionDrain ??= _drainSubscriptions(prefs);
    // Limit the caller's wait only. Native operations remain serialized even
    // after this Future times out, so a late subscribe cannot win over OFF.
    await _runSafely('notification subscriptions', () => drain);
  }

  Map<String, bool> _desiredTopicSubscriptions(SharedPreferences prefs) {
    final currentTeamId = prefs.getString(_teamKey);
    final currentUid = prefs.getString(_userUidKey);
    final allEnabled = _readBoolPref(prefs, _allNotificationsKey, true);
    final matchPref = _readMatchPreference(prefs);
    _retiredTopics.addAll(prefs.getStringList(_pendingTopicCleanupKey) ?? []);
    final desired = <String, bool>{
      for (final topic in _retiredTopics) topic: false,
      _topicCommunityUrgent: allEnabled,
      _topicCommunityNotices:
          allEnabled && _readBoolPref(prefs, _communityNoticeKey, true),
      _topicMatchesAll: allEnabled && matchPref == MatchNotifyPreference.all,
    };
    if (currentTeamId != null && currentTeamId.isNotEmpty) {
      desired['team_${currentTeamId}_notices'] =
          allEnabled && _readBoolPref(prefs, _teamNoticeKey, true);
      desired['team_${currentTeamId}_matches'] =
          allEnabled && matchPref == MatchNotifyPreference.team;
    }
    if (currentUid != null && currentUid.isNotEmpty) {
      desired['inquiry_$currentUid'] =
          allEnabled && _readBoolPref(prefs, _inquiryNotifKey, true);
    }
    return desired;
  }

  Future<void> _drainSubscriptions(SharedPreferences prefs) async {
    try {
      while (_subscriptionsDirty) {
        _subscriptionsDirty = false;
        final desired = _desiredTopicSubscriptions(prefs);
        for (final entry in desired.entries) {
          try {
            if (entry.value) {
              await _messaging.subscribeToTopic(entry.key);
            } else {
              await _messaging.unsubscribeFromTopic(entry.key);
              if (_retiredTopics.remove(entry.key)) {
                await prefs.setStringList(
                  _pendingTopicCleanupKey,
                  _retiredTopics.toList(),
                );
              }
            }
          } catch (_) {
            debugPrint('[NotificationService] Topic update unavailable.');
          }
          // A preference or identity changed while this native call waited.
          // Finish that call, then rebuild the plan from the latest values.
          if (_subscriptionsDirty) break;
        }
      }
    } finally {
      _subscriptionDrain = null;
    }
  }

  Future<void> _handleForegroundMessage(RemoteMessage message) async {
    final notification = message.notification;
    final rawTitle = notification?.title ?? message.data['title'] as String?;
    final rawBody = notification?.body ?? message.data['body'] as String?;
    if ((rawTitle == null || rawTitle.trim().isEmpty) &&
        (rawBody == null || rawBody.trim().isEmpty)) {
      return;
    }

    final navType = message.data['nav_type'] as String? ?? '';
    final payload = navType.isNotEmpty
        ? jsonEncode({'nav_type': navType})
        : null;
    final normalizedTitle = _normalizeNotificationText(
      rawTitle,
      fallback: 'AUBL 알림',
    );
    final normalizedBody = _normalizeNotificationText(rawBody);

    final android = notification?.android;
    final apple = notification?.apple;
    final details = NotificationDetails(
      android: AndroidNotificationDetails(
        _channelId,
        'AUBL 알림',
        channelDescription: '경기 및 공지 알림',
        importance: Importance.high,
        priority: Priority.high,
        icon: android?.smallIcon ?? _androidSmallIcon,
        largeIcon: const DrawableResourceAndroidBitmap('ic_launcher'),
      ),
      iOS: DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
        subtitle: apple?.subtitle,
      ),
    );

    if (_isPushSupportedPlatform) {
      await _local.show(
        id: message.hashCode,
        title: normalizedTitle,
        body: normalizedBody,
        notificationDetails: details,
        payload: payload,
      );
    }
  }

  String? _normalizeNotificationText(String? raw, {String? fallback}) {
    if (raw == null || raw.trim().isEmpty) return fallback;
    final trimmed = raw.trim();
    final hasDeltaPattern = RegExp(
      r'(\\?"ops\\?"\s*:|\\?"insert\\?"\s*:)',
    ).hasMatch(trimmed);
    if (!hasDeltaPattern) {
      return trimmed;
    }

    final deltaStartMatch = RegExp(r'\{\\?"ops\\?"\s*:').firstMatch(trimmed);
    final deltaStart = deltaStartMatch?.start ?? 0;
    final prefix = deltaStart > 0
        ? trimmed.substring(0, deltaStart).trim()
        : '';
    final deltaRaw = trimmed.substring(deltaStart).trim();
    final deltaText =
        _extractDeltaPreviewText(deltaRaw) ??
        _extractDeltaPreviewText(trimmed.replaceAll(r'\"', '"'));
    if (deltaText == null || deltaText.isEmpty) {
      return prefix.isEmpty ? fallback ?? trimmed : prefix;
    }
    if (prefix.isEmpty) return deltaText;
    return '${prefix.replaceFirst(RegExp(r'[:\s]+$'), '')}\n$deltaText';
  }

  String? _extractDeltaPreviewText(String raw) {
    final normalizedRaw = raw.replaceAll(r'\"', '"');
    List<dynamic>? ops;
    try {
      final decoded = jsonDecode(normalizedRaw);
      if (decoded is Map && decoded['ops'] is List) {
        ops = decoded['ops'] as List<dynamic>;
      } else if (decoded is List) {
        ops = decoded;
      } else if (decoded is String) {
        final nested = jsonDecode(decoded);
        if (nested is Map && nested['ops'] is List) {
          ops = nested['ops'] as List<dynamic>;
        } else if (nested is List) {
          ops = nested;
        }
      }
    } catch (_) {}

    if (ops == null) {
      final fragments = <String>[];

      final quotedInsertMatches = RegExp(
        r'"insert"\s*:\s*"((?:\\.|[^"\\])*)"',
      ).allMatches(normalizedRaw);
      for (final m in quotedInsertMatches) {
        final value = m.group(1);
        if (value == null || value.isEmpty) continue;
        try {
          final unescaped = jsonDecode('"$value"');
          if (unescaped is String && unescaped.trim().isNotEmpty) {
            fragments.add(unescaped.trim());
          }
        } catch (_) {
          final fallback = value
              .replaceAll(r'\n', '\n')
              .replaceAll(r'\"', '"')
              .trim();
          if (fallback.isNotEmpty) fragments.add(fallback);
        }
      }

      final plainInsertMatches = RegExp(
        r'"insert"\s*:\s*([^,\}\]]+)',
      ).allMatches(normalizedRaw).map((m) => m.group(1)?.trim() ?? '');
      for (final rawValue in plainInsertMatches) {
        if (rawValue.isEmpty) continue;
        if (rawValue.startsWith('"') || rawValue.startsWith('{')) continue;
        var cleaned = rawValue.replaceAll(r'\n', '\n').trim();
        if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
            (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
          cleaned = cleaned.substring(1, cleaned.length - 1).trim();
        }
        if (cleaned.isNotEmpty) fragments.add(cleaned);
      }

      if (RegExp(r'"image"\s*:').hasMatch(normalizedRaw)) {
        fragments.add('[이미지]');
      }
      if (RegExp(r'"video"\s*:').hasMatch(normalizedRaw)) {
        fragments.add('[동영상]');
      }

      // 비정형 payload 대응:
      // 예) {"ops":[f"insert":2026... 처럼 JSON이 깨져도 insert 값 회수 시도
      final permissiveInsertMatches = RegExp(
        r'''(?:^|[^A-Za-z0-9_])(?:[fFrRbBuU])?["']?insert["']?\s*:\s*(?:(["'])([\s\S]*?)\1|([^,\}\]]+))''',
        multiLine: true,
        dotAll: true,
      ).allMatches(normalizedRaw);
      for (final m in permissiveInsertMatches) {
        final rawValue = (m.group(2) ?? m.group(3) ?? '').trim();
        if (rawValue.isEmpty) continue;
        final cleaned = rawValue
            .replaceAll(r'\n', '\n')
            .replaceAll(r'\"', '"')
            .replaceAll(RegExp(r'^\[|\]$'), '')
            .trim();
        if (cleaned.isNotEmpty) {
          fragments.add(cleaned);
        }
      }

      if (fragments.isEmpty) return null;
      return fragments.join(' ').replaceAll(RegExp(r'\s+'), ' ').trim();
    }

    final buffer = StringBuffer();
    for (final op in ops) {
      if (op is! Map) continue;
      final insert = op['insert'];
      if (insert is String) {
        buffer.write(insert);
      } else if (insert is Map) {
        if (insert.containsKey('image')) buffer.write('[이미지] ');
        if (insert.containsKey('video')) buffer.write('[동영상] ');
      }
    }
    final text = buffer
        .toString()
        .replaceAll(RegExp(r'\n+'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    return text.isEmpty ? null : text;
  }
}
