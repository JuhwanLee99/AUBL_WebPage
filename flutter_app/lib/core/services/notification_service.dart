import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum MatchNotifyPreference { all, team, off }

class NotificationService {
  NotificationService._();

  static final NotificationService instance = NotificationService._();

  static const String _teamKey = 'notif_team_id';
  static const String _matchPrefKey = 'notif_match_pref';
  static const String _communityNoticeKey = 'notif_community_notice';
  static const String _teamNoticeKey = 'notif_team_notice';
  static const String _topicCommunityUrgent = 'community_urgent';
  static const String _topicCommunityNotices = 'community_notices';
  static const String _topicMatchesAll = 'matches_all';
  static const String _channelId = 'aubl_default';

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;

    if (!Platform.isAndroid) {
      _initialized = true;
      return;
    }

    await _messaging.requestPermission(alert: true, badge: true, sound: true);

    const initSettings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(),
    );
    await _local.initialize(initSettings);

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

    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
    await _messaging.subscribeToTopic(_topicCommunityUrgent);
    final prefs = await SharedPreferences.getInstance();
    final storedTeam = prefs.getString(_teamKey);
    final communityNoticeOn = _readBoolPref(prefs, _communityNoticeKey, true);
    final teamNoticeOn = _readBoolPref(prefs, _teamNoticeKey, true);
    if (communityNoticeOn) {
      await _messaging.subscribeToTopic(_topicCommunityNotices);
    } else {
      await _messaging.unsubscribeFromTopic(_topicCommunityNotices);
    }
    if (teamNoticeOn && storedTeam != null && storedTeam.isNotEmpty) {
      await _messaging.subscribeToTopic('team_${storedTeam}_notices');
    } else if (storedTeam != null && storedTeam.isNotEmpty) {
      await _messaging.unsubscribeFromTopic('team_${storedTeam}_notices');
    }
    final pref = _readMatchPreference(prefs);
    await _applyMatchPreference(pref, storedTeam);
    _initialized = true;
  }

  Future<MatchNotifyPreference> getMatchPreference() async {
    final prefs = await SharedPreferences.getInstance();
    return _readMatchPreference(prefs);
  }

  Future<bool> getCommunityNoticeEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return _readBoolPref(prefs, _communityNoticeKey, true);
  }

  Future<bool> getTeamNoticeEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return _readBoolPref(prefs, _teamNoticeKey, true);
  }

  Future<void> setCommunityNoticeEnabled(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_communityNoticeKey, enabled);
    if (!Platform.isAndroid) return;
    if (enabled) {
      await _messaging.subscribeToTopic(_topicCommunityNotices);
    } else {
      await _messaging.unsubscribeFromTopic(_topicCommunityNotices);
    }
  }

  Future<void> setTeamNoticeEnabled(
    bool enabled, {
    String? teamId,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_teamNoticeKey, enabled);
    if (!Platform.isAndroid) return;
    final storedTeam = teamId ?? prefs.getString(_teamKey);
    if (storedTeam == null || storedTeam.isEmpty) return;
    if (enabled) {
      await _messaging.subscribeToTopic('team_${storedTeam}_notices');
    } else {
      await _messaging.unsubscribeFromTopic('team_${storedTeam}_notices');
    }
  }

  Future<void> setMatchPreference(
    MatchNotifyPreference pref, {
    String? teamId,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    if (!Platform.isAndroid) {
      await prefs.setString(_matchPrefKey, pref.name);
      return;
    }
    final prev = _readMatchPreference(prefs);
    final storedTeam = teamId ?? prefs.getString(_teamKey);
    await _switchMatchPreference(prev, pref, storedTeam);
    await prefs.setString(_matchPrefKey, pref.name);
  }

  Future<void> updateTeamSubscriptions(String? teamId) async {
    final prefs = await SharedPreferences.getInstance();
    if (!Platform.isAndroid) {
      if (teamId != null && teamId.isNotEmpty) {
        await prefs.setString(_teamKey, teamId);
      } else {
        await prefs.remove(_teamKey);
      }
      return;
    }
    final prev = prefs.getString(_teamKey);
    final matchPref = _readMatchPreference(prefs);
    final teamNoticeOn = _readBoolPref(prefs, _teamNoticeKey, true);
    if (prev != null && prev != teamId) {
      if (teamNoticeOn) {
        await _messaging.unsubscribeFromTopic('team_${prev}_notices');
      }
      if (matchPref == MatchNotifyPreference.team) {
        await _messaging.unsubscribeFromTopic('team_${prev}_matches');
      }
    }

    if (teamId != null && teamId.isNotEmpty) {
      if (teamNoticeOn) {
        await _messaging.subscribeToTopic('team_${teamId}_notices');
      } else {
        await _messaging.unsubscribeFromTopic('team_${teamId}_notices');
      }
      if (matchPref == MatchNotifyPreference.team) {
        await _messaging.subscribeToTopic('team_${teamId}_matches');
      }
      await prefs.setString(_teamKey, teamId);
    } else {
      await prefs.remove(_teamKey);
      if (matchPref == MatchNotifyPreference.team) {
        await _messaging.unsubscribeFromTopic('team_${prev}_matches');
      }
    }
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

  Future<void> _applyMatchPreference(
    MatchNotifyPreference pref,
    String? teamId,
  ) async {
    await _switchMatchPreference(null, pref, teamId);
  }

  Future<void> _switchMatchPreference(
    MatchNotifyPreference? prev,
    MatchNotifyPreference next,
    String? teamId,
  ) async {
    if (prev == MatchNotifyPreference.all && next != MatchNotifyPreference.all) {
      await _messaging.unsubscribeFromTopic(_topicMatchesAll);
    }
    if (prev == MatchNotifyPreference.team && next != MatchNotifyPreference.team) {
      if (teamId != null && teamId.isNotEmpty) {
        await _messaging.unsubscribeFromTopic('team_${teamId}_matches');
      }
    }

    if (next == MatchNotifyPreference.all) {
      await _messaging.subscribeToTopic(_topicMatchesAll);
      if (teamId != null && teamId.isNotEmpty) {
        await _messaging.unsubscribeFromTopic('team_${teamId}_matches');
      }
    } else if (next == MatchNotifyPreference.team) {
      if (teamId != null && teamId.isNotEmpty) {
        await _messaging.subscribeToTopic('team_${teamId}_matches');
      }
      await _messaging.unsubscribeFromTopic(_topicMatchesAll);
    } else {
      await _messaging.unsubscribeFromTopic(_topicMatchesAll);
    }
  }

  Future<void> _handleForegroundMessage(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;

    final android = notification.android;
    final apple = notification.apple;
    final details = NotificationDetails(
      android: AndroidNotificationDetails(
        _channelId,
        'AUBL 알림',
        channelDescription: '경기 및 공지 알림',
        importance: Importance.high,
        priority: Priority.high,
        icon: android?.smallIcon ?? '@mipmap/ic_launcher',
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
        notification.hashCode,
        notification.title,
        notification.body,
        details,
      );
    }
  }
}
