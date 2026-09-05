import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../core/contracts/web_contracts.dart';
import '../core/navigation/app_destination.dart';
import '../core/services/auth_session_service.dart';
import '../core/services/notification_service.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/theme_controller.dart';
import '../core/webview/app_webview_screen.dart';
import '../features/feature_entries.dart';
import 'shell_controller.dart';

class MoreScreen extends StatefulWidget {
  const MoreScreen({super.key});

  @override
  State<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends State<MoreScreen> {
  StreamSubscription<User?>? _authSub;
  int _roleRequestId = 0;
  bool _isAdmin = false;
  bool _isScorer = false;
  bool _checking = true;
  bool _loggedIn = false;
  bool _loadingNotif = true;
  MatchNotifyPreference _matchPref = MatchNotifyPreference.team;
  bool _allNotificationsOn = true;
  bool _communityNoticeOn = true;
  bool _teamNoticeOn = true;
  bool _inquiryNotifOn = true;

  @override
  void initState() {
    super.initState();
    _bindAuthState();
    _loadNotificationPrefs();
  }

  void _bindAuthState() {
    _applyAuthState(FirebaseAuth.instance.currentUser);
    _authSub = FirebaseAuth.instance.authStateChanges().listen(_applyAuthState);
  }

  void _applyAuthState(User? user) {
    if (!mounted) return;
    setState(() {
      _loggedIn = user != null;
      _checking = false;
      if (user == null) {
        _isAdmin = false;
        _isScorer = false;
      }
    });

    if (user == null) {
      unawaited(_updateInquiryNotifications(null));
      return;
    }

    unawaited(_updateInquiryNotifications(user.uid));
    unawaited(_refreshRoleFlags(user));
  }

  Future<void> _updateInquiryNotifications(String? uid) async {
    try {
      await NotificationService.instance.updateUserInquiryTopic(uid);
    } catch (_) {
      // Authentication and menu rendering remain available without push.
    }
  }

  Future<void> _refreshRoleFlags(User user) async {
    final requestId = ++_roleRequestId;
    try {
      final token = await user.getIdTokenResult();
      var isAdmin = token.claims?['admin'] == true;
      var isScorer = false;
      if (!isAdmin) {
        final roleDoc = await FirebaseFirestore.instance
            .collection('roles')
            .doc(user.uid)
            .get();
        final data = roleDoc.data();
        isScorer = roleDoc.exists && data?['role'] == 'scorer';
      }
      if (!mounted || requestId != _roleRequestId) return;
      setState(() {
        _isAdmin = isAdmin;
        _isScorer = isScorer;
      });
    } catch (_) {
      if (!mounted || requestId != _roleRequestId) return;
      setState(() {
        _isAdmin = false;
        _isScorer = false;
      });
    }
  }

  @override
  void dispose() {
    _authSub?.cancel();
    super.dispose();
  }

  Future<void> _loadNotificationPrefs() async {
    final pref = await NotificationService.instance.getMatchPreference();
    final allEnabled = await NotificationService.instance
        .getAllNotificationsEnabled();
    final community = await NotificationService.instance
        .getCommunityNoticeEnabled();
    final teamNotice = await NotificationService.instance
        .getTeamNoticeEnabled();
    final inquiry = await NotificationService.instance.getInquiryNotifEnabled();
    if (!mounted) return;
    setState(() {
      _matchPref = pref;
      _allNotificationsOn = allEnabled;
      _communityNoticeOn = community;
      _teamNoticeOn = teamNotice;
      _inquiryNotifOn = inquiry;
      _loadingNotif = false;
    });
  }

  String _matchPrefLabel(MatchNotifyPreference pref) {
    return switch (pref) {
      MatchNotifyPreference.all => '전체 경기',
      MatchNotifyPreference.team => '소속팀 경기',
      MatchNotifyPreference.off => '경기 알림 받지 않음',
    };
  }

  String _noticePrefLabel() {
    final community = _communityNoticeOn ? '커뮤니티' : '커뮤니티 off';
    final team = _teamNoticeOn ? '홈팀' : '홈팀 off';
    final inquiry = _inquiryNotifOn ? '건의/문의' : '건의/문의 off';
    return '$community · $team · $inquiry';
  }

  String _notificationSummary() {
    if (!_allNotificationsOn) return '전체 알림 받지 않음';
    return '${_matchPrefLabel(_matchPref)} · ${_noticePrefLabel()}';
  }

  void _openThemeSettings() {
    final controller = ThemeControllerScope.of(context);
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('화면 테마', style: Theme.of(sheetContext).textTheme.titleLarge),
              const SizedBox(height: 6),
              Text(
                '시스템 설정을 기본으로 사용하며 언제든 직접 바꿀 수 있습니다.',
                style: Theme.of(sheetContext).textTheme.bodySmall?.copyWith(
                  color: sheetContext.aublColors.muted,
                ),
              ),
              const SizedBox(height: 12),
              RadioGroup<ThemePreference>(
                groupValue: controller.preference,
                onChanged: (value) {
                  if (value == null) return;
                  controller.setPreference(value);
                  Navigator.of(sheetContext).pop();
                },
                child: Column(
                  children: ThemePreference.values
                      .map(
                        (preference) => RadioListTile<ThemePreference>(
                          value: preference,
                          title: Text(preference.label),
                          secondary: Icon(switch (preference) {
                            ThemePreference.system =>
                              Icons.brightness_auto_outlined,
                            ThemePreference.light => Icons.light_mode_outlined,
                            ThemePreference.dark => Icons.dark_mode_outlined,
                          }),
                        ),
                      )
                      .toList(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _openNotificationSettings() {
    final colors = context.aublColors;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        var temp = _matchPref;
        var tempAll = _allNotificationsOn;
        var tempInquiry = _inquiryNotifOn;
        var tempCommunity = _communityNoticeOn;
        var tempTeam = _teamNoticeOn;
        return StatefulBuilder(
          builder: (context, setSheetState) {
            final bottomInset = MediaQuery.of(context).viewInsets.bottom;
            return SafeArea(
              top: false,
              child: SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(16, 16, 16, 24 + bottomInset),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '알림 설정',
                      style: TextStyle(
                        color: colors.ink,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '전체 알림을 끄면 긴급 공지를 포함해 모든 알림이 중단됩니다.',
                      style: TextStyle(color: colors.muted, fontSize: 12),
                    ),
                    const SizedBox(height: 12),
                    SwitchListTile(
                      value: tempAll,
                      onChanged: (value) async {
                        setSheetState(() => tempAll = value);
                        setState(() => _allNotificationsOn = value);
                        await NotificationService.instance
                            .setAllNotificationsEnabled(value);
                      },
                      activeThumbColor: colors.cobalt,
                      title: Text('전체 알림', style: TextStyle(color: colors.ink)),
                      subtitle: Text(
                        '긴급 공지 포함 전체 알림 (ON/OFF)',
                        style: TextStyle(color: colors.muted, fontSize: 12),
                      ),
                    ),
                    SwitchListTile(
                      value: tempCommunity,
                      onChanged: !tempAll
                          ? null
                          : (value) async {
                              setSheetState(() => tempCommunity = value);
                              setState(() => _communityNoticeOn = value);
                              await NotificationService.instance
                                  .setCommunityNoticeEnabled(value);
                            },
                      activeThumbColor: colors.cobalt,
                      title: Text(
                        '커뮤니티 공지',
                        style: TextStyle(color: colors.ink),
                      ),
                      subtitle: Text(
                        '긴급 제외 공지 알림 (ON/OFF)',
                        style: TextStyle(color: colors.muted, fontSize: 12),
                      ),
                    ),
                    SwitchListTile(
                      value: tempTeam,
                      onChanged: !tempAll
                          ? null
                          : (value) async {
                              setSheetState(() => tempTeam = value);
                              setState(() => _teamNoticeOn = value);
                              await NotificationService.instance
                                  .setTeamNoticeEnabled(value);
                            },
                      activeThumbColor: colors.cobalt,
                      title: Text('홈팀 공지', style: TextStyle(color: colors.ink)),
                      subtitle: Text(
                        '소속 팀 공지 알림',
                        style: TextStyle(color: colors.muted, fontSize: 12),
                      ),
                    ),
                    SwitchListTile(
                      value: tempInquiry,
                      onChanged: !tempAll
                          ? null
                          : (value) async {
                              setSheetState(() => tempInquiry = value);
                              setState(() => _inquiryNotifOn = value);
                              await NotificationService.instance
                                  .setInquiryNotifEnabled(value);
                            },
                      activeThumbColor: colors.cobalt,
                      title: Text(
                        '건의/문의 알림',
                        style: TextStyle(color: colors.ink),
                      ),
                      subtitle: Text(
                        '내 글의 처리 상태 변경 및 새 댓글 알림',
                        style: TextStyle(color: colors.muted, fontSize: 12),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                      child: Text(
                        '경기 알림 설정',
                        style: TextStyle(
                          color: colors.muted,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                    Divider(height: 1, color: colors.line),
                    const SizedBox(height: 4),
                    IgnorePointer(
                      ignoring: !tempAll,
                      child: Opacity(
                        opacity: tempAll ? 1 : 0.55,
                        child: RadioGroup<MatchNotifyPreference>(
                          groupValue: temp,
                          onChanged: (value) {
                            if (value == null || !tempAll) return;
                            setSheetState(() => temp = value);
                            NotificationService.instance.setMatchPreference(
                              value,
                            );
                            if (mounted) {
                              setState(() => _matchPref = value);
                            }
                          },
                          child: Column(
                            children: [
                              for (final pref in MatchNotifyPreference.values)
                                RadioListTile<MatchNotifyPreference>(
                                  value: pref,
                                  activeColor: colors.cobalt,
                                  title: Text(
                                    _matchPrefLabel(pref),
                                    style: TextStyle(color: colors.ink),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  void _push(Widget screen) {
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
  }

  Future<void> _login() async {
    await Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => const LoginWebViewScreen()));
  }

  Future<void> _logout() async {
    if (mounted) {
      setState(() {
        _loggedIn = false;
        _isAdmin = false;
        _isScorer = false;
        _checking = false;
      });
    }
    try {
      await AuthSessionService.signOutFast();
    } catch (_) {
      _applyAuthState(FirebaseAuth.instance.currentUser);
    }
  }

  Widget _buildLoginBanner() {
    final colors = context.aublColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Material(
        color: colors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(4),
          side: BorderSide(color: colors.line),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          borderRadius: BorderRadius.circular(4),
          onTap: _login,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: colors.surfaceMuted,
                    border: Border.all(color: colors.line),
                    borderRadius: BorderRadius.circular(3),
                  ),
                  child: Icon(Icons.person_outline, color: colors.navy),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '로그인하고 더 많은 기능을 이용하세요',
                        style: TextStyle(
                          color: colors.ink,
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '팀 관리, 승부예측 등 다양한 기능을 사용할 수 있습니다.',
                        style: TextStyle(color: colors.muted, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  constraints: const BoxConstraints(minHeight: 44),
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: colors.navy,
                    borderRadius: BorderRadius.circular(2),
                  ),
                  child: Text(
                    '로그인',
                    style: TextStyle(
                      color: Theme.of(context).brightness == Brightness.dark
                          ? AppTheme.navy950
                          : Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('더보기')),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final outerInset = constraints.maxWidth > 860
              ? (constraints.maxWidth - 860) / 2
              : 0.0;
          return ListView(
            padding: EdgeInsets.fromLTRB(outerInset, 0, outerInset, 32),
            children: [
              if (!_checking && !_loggedIn) ...[
                _buildLoginBanner(),
                const SizedBox(height: 8),
              ],
              const _SectionTitle('일반'),
              _MenuTile(
                icon: Icons.emoji_events,
                label: '순위',
                onTap: () {
                  final shell = ShellController.of(context);
                  if (shell != null) {
                    shell.switchTab(
                      AppDestination.records,
                      recordsTabIndex: RecordsHubTab.standings.index,
                    );
                    return;
                  }
                  _push(
                    const RecordsScreen(initialTab: RecordsHubTab.standings),
                  );
                },
              ),
              _MenuTile(
                icon: Icons.palette_outlined,
                label: '화면 테마',
                value: ThemeControllerScope.of(context).preference.label,
                onTap: _openThemeSettings,
              ),
              _MenuTile(
                icon: Icons.person,
                label: '계정',
                onTap: () => _push(const AccountScreen()),
              ),
              const Divider(height: 32),
              const _SectionTitle('알림'),
              _MenuTile(
                icon: Icons.notifications_active,
                label: '알림 설정',
                value: _loadingNotif ? '확인 중...' : _notificationSummary(),
                onTap: _openNotificationSettings,
              ),
              const Divider(height: 32),
              const _SectionTitle('리그 정보'),
              _MenuTile(
                icon: Icons.info_outline,
                label: '리그 소개',
                onTap: () => _push(const IntroScreen()),
              ),
              _MenuTile(
                icon: Icons.menu_book,
                label: '회칙',
                onTap: () => _push(const RulesScreen()),
              ),

              // TODO: 승부예측 기능 구현 후 활성화
              // _MenuTile(
              //   icon: Icons.analytics,
              //   label: '승부예측',
              //   onTap: () => _push(const PredictionScreen()),
              // ),
              if (!_checking && _loggedIn && (_isAdmin || _isScorer)) ...[
                const Divider(height: 32),
                _SectionTitle(_isAdmin ? '관리자' : '기록원'),
                _MenuTile(
                  icon: Icons.fact_check,
                  label: '기록원',
                  onTap: () {
                    final shell = ShellController.of(context);
                    if (shell != null) {
                      shell.openEmbeddedWebView(
                        WebRouteContracts.scorekeeper,
                        '기록원',
                        fullscreen: true,
                      );
                    } else {
                      _push(
                        const AppWebViewScreen(
                          path: WebRouteContracts.scorekeeper,
                          title: '기록원',
                        ),
                      );
                    }
                  },
                ),
                _MenuTile(
                  icon: Icons.edit_note,
                  label: '경기 기록 수정',
                  onTap: () => _push(
                    const AppWebViewScreen(
                      path: WebRouteContracts.adminGames,
                      title: '경기 기록 수정',
                    ),
                  ),
                ),
                if (_isAdmin) ...[
                  _MenuTile(
                    icon: Icons.scoreboard,
                    label: '스코어보드',
                    onTap: () => _push(
                      const AppWebViewScreen(
                        path: WebRouteContracts.scoreboard,
                        title: '스코어보드',
                      ),
                    ),
                  ),
                  _MenuTile(
                    icon: Icons.admin_panel_settings,
                    label: '관리자 패널',
                    onTap: () => _push(
                      const AppWebViewScreen(
                        path: WebRouteContracts.admin,
                        title: '관리자',
                      ),
                    ),
                  ),
                  _MenuTile(
                    icon: Icons.report_problem_outlined,
                    label: '신고/차단 관리',
                    onTap: () => _push(
                      const AppWebViewScreen(
                        path: WebRouteContracts.adminModeration,
                        title: '신고/차단 관리',
                      ),
                    ),
                  ),
                  _MenuTile(
                    icon: Icons.edit_calendar,
                    label: '일정 관리',
                    onTap: () => _push(
                      const AppWebViewScreen(
                        path: WebRouteContracts.scheduleManage,
                        title: '일정 관리',
                      ),
                    ),
                  ),
                ],
              ],

              const Divider(height: 32),
              const _SectionTitle('도움말'),
              _MenuTile(
                icon: Icons.help_outline,
                label: '사용 설명서',
                onTap: () => _push(const UserManualScreen()),
              ),
              const Divider(height: 32),
              const _SectionTitle('앱 정보'),
              _MenuTile(
                icon: Icons.privacy_tip_outlined,
                label: '개인정보 처리방침',
                onTap: () => _push(const PrivacyScreen()),
              ),
              _MenuTile(
                icon: Icons.description_outlined,
                label: '이용약관',
                onTap: () => _push(const TermsScreen()),
              ),
              const Divider(height: 32),
              if (_loggedIn)
                _MenuTile(
                  icon: Icons.logout,
                  label: '로그아웃',
                  color: context.aublColors.danger,
                  onTap: _logout,
                )
              else
                _MenuTile(
                  icon: Icons.login,
                  label: '로그인',
                  color: context.aublColors.cobalt,
                  onTap: _login,
                ),
              const SizedBox(height: 32),
            ],
          );
        },
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title);
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 7),
      child: Container(
        padding: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(color: context.aublColors.navy, width: 2),
          ),
        ),
        child: Text(
          title.toUpperCase(),
          style: TextStyle(
            color: context.aublColors.cobalt,
            fontFamily: 'BarlowCondensed',
            fontSize: 12,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.2,
          ),
        ),
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
    this.value,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;
  final String? value;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
      child: Material(
        color: colors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(4),
          side: BorderSide(color: colors.line),
        ),
        clipBehavior: Clip.antiAlias,
        child: ListTile(
          minTileHeight: 58,
          leading: Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: colors.surfaceMuted,
              borderRadius: BorderRadius.circular(3),
              border: Border.all(color: colors.line),
            ),
            child: Icon(icon, size: 20, color: color ?? colors.navy),
          ),
          title: Text(
            label,
            style: TextStyle(
              color: color ?? colors.ink,
              fontWeight: FontWeight.w700,
            ),
          ),
          subtitle: value == null
              ? null
              : Text(
                  value!,
                  style: TextStyle(color: colors.muted, fontSize: 12),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
          trailing: Icon(
            Icons.arrow_forward_rounded,
            size: 18,
            color: color ?? colors.muted,
          ),
          onTap: onTap,
        ),
      ),
    );
  }
}
