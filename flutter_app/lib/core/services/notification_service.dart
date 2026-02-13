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
  static const String _allNotificationsKey = 'notif_all_enabled';
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

    final prefs = await SharedPreferences.getInstance();
    final storedTeam = prefs.getString(_teamKey);
    await _syncSubscriptions(prefs, teamId: storedTeam);
    _initialized = true;
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

  Future<void> setTeamNoticeEnabled(
    bool enabled, {
    String? teamId,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_teamNoticeKey, enabled);
    final storedTeam = teamId ?? prefs.getString(_teamKey);
    await _syncSubscriptions(prefs, teamId: storedTeam);
  }

  Future<void> setMatchPreference(
    MatchNotifyPreference pref, {
    String? teamId,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_matchPrefKey, pref.name);
    final storedTeam = teamId ?? prefs.getString(_teamKey);
    await _syncSubscriptions(prefs, teamId: storedTeam);
  }

  Future<void> updateTeamSubscriptions(String? teamId) async {
    final prefs = await SharedPreferences.getInstance();
    final prev = prefs.getString(_teamKey);

    if (!Platform.isAndroid) {
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

    await _syncSubscriptions(prefs, teamId: teamId);
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
  }) async {
    if (!Platform.isAndroid) return;

    final currentTeamId = teamId ?? prefs.getString(_teamKey);
    final allEnabled = _readBoolPref(prefs, _allNotificationsKey, true);
    if (!allEnabled) {
      await _unsubscribeAllTopics(currentTeamId);
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
  }

  Future<void> _unsubscribeAllTopics(String? teamId) async {
    await _messaging.unsubscribeFromTopic(_topicCommunityUrgent);
    await _messaging.unsubscribeFromTopic(_topicCommunityNotices);
    await _messaging.unsubscribeFromTopic(_topicMatchesAll);
    if (teamId != null && teamId.isNotEmpty) {
      await _messaging.unsubscribeFromTopic('team_${teamId}_notices');
      await _messaging.unsubscribeFromTopic('team_${teamId}_matches');
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
