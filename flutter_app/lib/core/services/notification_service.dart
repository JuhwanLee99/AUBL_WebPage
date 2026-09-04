import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum MatchNotifyPreference { all, team, off }

class NotificationService {
  NotificationService._();

  static final NotificationService instance = NotificationService._();

  static const String _teamKey = 'notif_team_id';
  static const String _userUidKey = 'notif_user_uid';
  static const String _matchPrefKey = 'notif_match_pref';
  static const String _allNotificationsKey = 'notif_all_enabled';
  static const String _communityNoticeKey = 'notif_community_notice';
  static const String _teamNoticeKey = 'notif_team_notice';
  static const String _inquiryNotifKey = 'notif_inquiry';
  static const String _topicCommunityUrgent = 'community_urgent';
  static const String _topicCommunityNotices = 'community_notices';
  static const String _topicMatchesAll = 'matches_all';
  static const String _channelId = 'aubl_default';
  static const String _androidSmallIcon = 'ic_stat_aubl';

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;
  bool get _isPushSupportedPlatform => Platform.isAndroid || Platform.isIOS;

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

  Future<void> init() async {
    if (_initialized) return;

    if (!_isPushSupportedPlatform) {
      _initialized = true;
      return;
    }

    await _messaging.setAutoInitEnabled(true);
    final permission = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    if (Platform.isAndroid) {
      await _local
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();
    }
    if (Platform.isIOS) {
      await _messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
    }

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

    if (Platform.isAndroid) {
      const channel = AndroidNotificationChannel(
        _channelId,
        'AUBL 알림',
        description: '경기 및 공지 알림',
        importance: Importance.high,
      );
      await _local
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(channel);
    }

    if (Platform.isIOS) {
      final apnsToken = await _waitForApnsToken();
      if (apnsToken == null || apnsToken.isEmpty) {
        debugPrint(
          '[NotificationService] APNs token is not ready yet; '
          'skip initial FCM token fetch.',
        );
      } else {
        await _safeGetFcmToken();
      }
    } else {
      await _safeGetFcmToken();
    }
    debugPrint(
        '[NotificationService] ${Platform.isIOS ? 'iOS' : 'Android'} permission: ${permission.authorizationStatus}');
    _messaging.onTokenRefresh.listen((_) {});

    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // 백그라운드 → 포그라운드 (알림 탭)
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      final navType = message.data['nav_type'] as String? ?? '';
      _dispatchNav(navType);
    });

    // 앱 종료 상태에서 알림 탭으로 시작
    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) {
      final navType = initialMessage.data['nav_type'] as String? ?? '';
      if (navType.isNotEmpty) _pendingNav = navType;
    }

    final prefs = await SharedPreferences.getInstance();
    final storedTeam = prefs.getString(_teamKey);
    final storedUid = prefs.getString(_userUidKey);
    await _syncSubscriptions(prefs, teamId: storedTeam, uid: storedUid);
    _initialized = true;
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
    } catch (e) {
      debugPrint('[NotificationService] Failed to fetch FCM token: $e');
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
    final uid = prefs.getString(_userUidKey);
    await _syncSubscriptions(prefs, uid: uid);
  }

  Future<void> setCommunityNoticeEnabled(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_communityNoticeKey, enabled);
    final uid = prefs.getString(_userUidKey);
    await _syncSubscriptions(prefs, uid: uid);
  }

  Future<void> setTeamNoticeEnabled(
    bool enabled, {
    String? teamId,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_teamNoticeKey, enabled);
    final storedTeam = teamId ?? prefs.getString(_teamKey);
    final uid = prefs.getString(_userUidKey);
    await _syncSubscriptions(prefs, teamId: storedTeam, uid: uid);
  }

  Future<void> setInquiryNotifEnabled(bool enabled, {String? uid}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_inquiryNotifKey, enabled);
    final storedUid = uid ?? prefs.getString(_userUidKey);
    await _syncSubscriptions(prefs, uid: storedUid);
  }

  Future<void> setMatchPreference(
    MatchNotifyPreference pref, {
    String? teamId,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_matchPrefKey, pref.name);
    final storedTeam = teamId ?? prefs.getString(_teamKey);
    final uid = prefs.getString(_userUidKey);
    await _syncSubscriptions(prefs, teamId: storedTeam, uid: uid);
  }

  Future<void> updateTeamSubscriptions(String? teamId) async {
    final prefs = await SharedPreferences.getInstance();
    final prev = prefs.getString(_teamKey);
    final uid = prefs.getString(_userUidKey);

    if (!_isPushSupportedPlatform) {
      if (teamId != null && teamId.isNotEmpty) {
        await prefs.setString(_teamKey, teamId);
      } else {
        await prefs.remove(_teamKey);
      }
      return;
    }

    if (prev != null && prev.isNotEmpty && prev != teamId) {
      await _messaging.unsubscribeFromTopic('team_${prev}_notices');
      await _messaging.unsubscribeFromTopic('team_${prev}_matches');
    }

    if (teamId != null && teamId.isNotEmpty) {
      await prefs.setString(_teamKey, teamId);
    } else {
      await prefs.remove(_teamKey);
    }

    await _syncSubscriptions(prefs, teamId: teamId, uid: uid);
  }

  /// 로그인/로그아웃 시 호출 — uid가 null이면 구독 해제
  Future<void> updateUserInquiryTopic(String? uid) async {
    final prefs = await SharedPreferences.getInstance();
    final prev = prefs.getString(_userUidKey);

    if (!_isPushSupportedPlatform) {
      if (uid != null && uid.isNotEmpty) {
        await prefs.setString(_userUidKey, uid);
      } else {
        await prefs.remove(_userUidKey);
      }
      return;
    }

    if (prev != null && prev.isNotEmpty && prev != uid) {
      await _messaging.unsubscribeFromTopic('inquiry_$prev');
    }

    if (uid != null && uid.isNotEmpty) {
      await prefs.setString(_userUidKey, uid);
    } else {
      await prefs.remove(_userUidKey);
    }

    await _syncSubscriptions(prefs, uid: uid);
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

  Future<void> _syncSubscriptions(
    SharedPreferences prefs, {
    String? teamId,
    String? uid,
  }) async {
    if (!_isPushSupportedPlatform) return;

    final currentTeamId = teamId ?? prefs.getString(_teamKey);
    final currentUid = uid ?? prefs.getString(_userUidKey);
    final allEnabled = _readBoolPref(prefs, _allNotificationsKey, true);
    if (!allEnabled) {
      await _unsubscribeAllTopics(currentTeamId, uid: currentUid);
      return;
    }

    await _messaging.subscribeToTopic(_topicCommunityUrgent);

    final communityNoticeOn = _readBoolPref(prefs, _communityNoticeKey, true);
    if (communityNoticeOn) {
      await _messaging.subscribeToTopic(_topicCommunityNotices);
    } else {
      await _messaging.unsubscribeFromTopic(_topicCommunityNotices);
    }

    final teamNoticeOn = _readBoolPref(prefs, _teamNoticeKey, true);
    if (currentTeamId != null && currentTeamId.isNotEmpty) {
      if (teamNoticeOn) {
        await _messaging.subscribeToTopic('team_${currentTeamId}_notices');
      } else {
        await _messaging.unsubscribeFromTopic('team_${currentTeamId}_notices');
      }
    }

    final matchPref = _readMatchPreference(prefs);
    if (matchPref == MatchNotifyPreference.all) {
      await _messaging.subscribeToTopic(_topicMatchesAll);
    } else {
      await _messaging.unsubscribeFromTopic(_topicMatchesAll);
    }

    if (currentTeamId != null && currentTeamId.isNotEmpty) {
      if (matchPref == MatchNotifyPreference.team) {
        await _messaging.subscribeToTopic('team_${currentTeamId}_matches');
      } else {
        await _messaging.unsubscribeFromTopic('team_${currentTeamId}_matches');
      }
    }

    final inquiryNotifOn = _readBoolPref(prefs, _inquiryNotifKey, true);
    if (currentUid != null && currentUid.isNotEmpty) {
      if (inquiryNotifOn) {
        await _messaging.subscribeToTopic('inquiry_$currentUid');
      } else {
        await _messaging.unsubscribeFromTopic('inquiry_$currentUid');
      }
    }
  }

  Future<void> _unsubscribeAllTopics(String? teamId, {String? uid}) async {
    await _messaging.unsubscribeFromTopic(_topicCommunityUrgent);
    await _messaging.unsubscribeFromTopic(_topicCommunityNotices);
    await _messaging.unsubscribeFromTopic(_topicMatchesAll);
    if (teamId != null && teamId.isNotEmpty) {
      await _messaging.unsubscribeFromTopic('team_${teamId}_notices');
      await _messaging.unsubscribeFromTopic('team_${teamId}_matches');
    }
    if (uid != null && uid.isNotEmpty) {
      await _messaging.unsubscribeFromTopic('inquiry_$uid');
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
    final payload =
        navType.isNotEmpty ? jsonEncode({'nav_type': navType}) : null;
    final normalizedTitle =
        _normalizeNotificationText(rawTitle, fallback: 'AUBL 알림');
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

    if (Platform.isAndroid || Platform.isIOS) {
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
    final hasDeltaPattern =
        RegExp(r'(\\?"ops\\?"\s*:|\\?"insert\\?"\s*:)').hasMatch(trimmed);
    if (!hasDeltaPattern) {
      return trimmed;
    }

    final deltaStartMatch = RegExp(r'\{\\?"ops\\?"\s*:').firstMatch(trimmed);
    final deltaStart = deltaStartMatch?.start ?? 0;
    final prefix =
        deltaStart > 0 ? trimmed.substring(0, deltaStart).trim() : '';
    final deltaRaw = trimmed.substring(deltaStart).trim();
    final deltaText = _extractDeltaPreviewText(deltaRaw) ??
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

      final quotedInsertMatches = RegExp(r'"insert"\s*:\s*"((?:\\.|[^"\\])*)"')
          .allMatches(normalizedRaw);
      for (final m in quotedInsertMatches) {
        final value = m.group(1);
        if (value == null || value.isEmpty) continue;
        try {
          final unescaped = jsonDecode('"$value"');
          if (unescaped is String && unescaped.trim().isNotEmpty) {
            fragments.add(unescaped.trim());
          }
        } catch (_) {
          final fallback =
              value.replaceAll(r'\n', '\n').replaceAll(r'\"', '"').trim();
          if (fallback.isNotEmpty) fragments.add(fallback);
        }
      }

      final plainInsertMatches = RegExp(r'"insert"\s*:\s*([^,\}\]]+)')
          .allMatches(normalizedRaw)
          .map((m) => m.group(1)?.trim() ?? '');
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
