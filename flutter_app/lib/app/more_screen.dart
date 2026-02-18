import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../core/contracts/web_contracts.dart';
import '../core/services/notification_service.dart';
import '../core/theme/app_theme.dart';
import '../core/webview/app_webview_screen.dart';
import '../features/feature_entries.dart';
import 'shell_controller.dart';

class MoreScreen extends StatefulWidget {
  const MoreScreen({super.key});

  @override
  State<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends State<MoreScreen> {
  bool _isAdmin = false;
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
    _checkAuth();
    _loadNotificationPrefs();
  }

  Future<void> _checkAuth() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      if (mounted) {
        setState(() {
          _loggedIn = false;
          _checking = false;
        });
      }
      return;
    }
    _loggedIn = true;
    await NotificationService.instance.updateUserInquiryTopic(user.uid);
    try {
      final token = await user.getIdTokenResult(true);
      if (!mounted) return;
      setState(() {
        _isAdmin = token.claims?['admin'] == true;
        _checking = false;
      });
    } catch (_) {
      if (mounted) setState(() => _checking = false);
    }
  }

  Future<void> _loadNotificationPrefs() async {
    final pref = await NotificationService.instance.getMatchPreference();
    final allEnabled =
        await NotificationService.instance.getAllNotificationsEnabled();
    final community =
        await NotificationService.instance.getCommunityNoticeEnabled();
    final teamNotice =
        await NotificationService.instance.getTeamNoticeEnabled();
    final inquiry =
        await NotificationService.instance.getInquiryNotifEnabled();
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

  void _openNotificationSettings() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppTheme.slate900,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        var temp = _matchPref;
        var tempAll = _allNotificationsOn;
        var tempInquiry = _inquiryNotifOn;
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
                    const Text(
                      '알림 설정',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      '전체 알림을 끄면 긴급 공지를 포함해 모든 알림이 중단됩니다.',
                      style: TextStyle(color: AppTheme.slate400, fontSize: 12),
                    ),
                    const SizedBox(height: 12),
                    SwitchListTile(
                      value: tempAll,
                      onChanged: (value) async {
                        setSheetState(() => tempAll = value);
                        await NotificationService.instance
                            .setAllNotificationsEnabled(value);
                        if (mounted) {
                          setState(() => _allNotificationsOn = value);
                        }
                      },
                      activeThumbColor: AppTheme.blue400,
                      title: const Text('전체 알림',
                          style: TextStyle(color: Colors.white)),
                      subtitle: const Text('긴급 공지 포함 전체 알림 (ON/OFF)',
                          style: TextStyle(
                              color: AppTheme.slate500, fontSize: 12)),
                    ),
                    SwitchListTile(
                      value: _communityNoticeOn,
                      onChanged: !tempAll
                          ? null
                          : (value) async {
                              await NotificationService.instance
                                  .setCommunityNoticeEnabled(value);
                              if (mounted) {
                                setState(() => _communityNoticeOn = value);
                              }
                            },
                      activeThumbColor: AppTheme.blue400,
                      title: const Text('커뮤니티 공지',
                          style: TextStyle(color: Colors.white)),
                      subtitle: const Text('긴급 제외 공지 알림 (ON/OFF)',
                          style: TextStyle(
                              color: AppTheme.slate500, fontSize: 12)),
                    ),
                    SwitchListTile(
                      value: _teamNoticeOn,
                      onChanged: !tempAll
                          ? null
                          : (value) async {
                              await NotificationService.instance
                                  .setTeamNoticeEnabled(value);
                              if (mounted) {
                                setState(() => _teamNoticeOn = value);
                              }
                            },
                      activeThumbColor: AppTheme.blue400,
                      title: const Text('홈팀 공지',
                          style: TextStyle(color: Colors.white)),
                      subtitle: const Text('소속 팀 공지 알림',
                          style: TextStyle(
                              color: AppTheme.slate500, fontSize: 12)),
                    ),
                    SwitchListTile(
                      value: tempInquiry,
                      onChanged: !tempAll
                          ? null
                          : (value) async {
                              setSheetState(() => tempInquiry = value);
                              await NotificationService.instance
                                  .setInquiryNotifEnabled(value);
                              if (mounted) {
                                setState(() => _inquiryNotifOn = value);
                              }
                            },
                      activeThumbColor: AppTheme.blue400,
                      title: const Text('건의/문의 알림',
                          style: TextStyle(color: Colors.white)),
                      subtitle: const Text('내 글의 처리 상태 변경 및 새 댓글 알림',
                          style: TextStyle(
                              color: AppTheme.slate500, fontSize: 12)),
                    ),
                    const Padding(
                      padding: EdgeInsets.fromLTRB(16, 16, 16, 4),
                      child: Text(
                        '경기 알림 설정',
                        style: TextStyle(
                          color: AppTheme.slate400,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                    const Divider(height: 1, color: AppTheme.slate700),
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
                            NotificationService.instance
                                .setMatchPreference(value);
                            if (mounted) {
                              setState(() => _matchPref = value);
                            }
                          },
                          child: Column(
                            children: [
                              for (final pref in MatchNotifyPreference.values)
                                RadioListTile<MatchNotifyPreference>(
                                  value: pref,
                                  activeColor: AppTheme.blue400,
                                  title: Text(
                                    _matchPrefLabel(pref),
                                    style: const TextStyle(color: Colors.white),
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
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => screen),
    );
  }

  Future<void> _login() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const LoginWebViewScreen()),
    );
    // 로그인 후 돌아오면 상태 갱신
    if (mounted) _checkAuth();
  }

  Future<void> _logout() async {
    await NotificationService.instance.updateUserInquiryTopic(null);
    try {
      await GoogleSignIn().signOut();
    } catch (_) {}
    await FirebaseAuth.instance.signOut();
    await WebViewCookieManager().clearCookies();
    if (mounted) {
      setState(() {
        _loggedIn = false;
        _isAdmin = false;
      });
    }
  }

  Widget _buildLoginBanner() {
    return GestureDetector(
      onTap: _login,
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF1E3A8A), Color(0xFF3B82F6)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            const Icon(Icons.person_outline, color: Colors.white, size: 32),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('로그인하고 더 많은 기능을 이용하세요',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w600)),
                  SizedBox(height: 4),
                  Text('팀 관리, 승부예측 등 다양한 기능을 사용할 수 있습니다.',
                      style: TextStyle(color: Colors.white70, fontSize: 12)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text('로그인',
                  style: TextStyle(
                      color: Color(0xFF1E3A8A),
                      fontSize: 13,
                      fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('더보기')),
      body: ListView(
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
                shell.switchTab(3,
                    recordsTabIndex: RecordsHubTab.standings.index);
                return;
              }
              _push(const RecordsScreen(initialTab: RecordsHubTab.standings));
            },
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

          if (!_checking && _loggedIn && _isAdmin) ...[
            const Divider(height: 32),
            const _SectionTitle('관리자'),
            _MenuTile(
              icon: Icons.fact_check,
              label: '기록원',
              onTap: () {
                final shell = ShellController.of(context);
                if (shell != null) {
                  shell.openEmbeddedWebView(
                      WebRouteContracts.scorekeeper, '기록원',
                      fullscreen: true);
                } else {
                  _push(const AppWebViewScreen(
                    path: WebRouteContracts.scorekeeper,
                    title: '기록원',
                  ));
                }
              },
            ),
            _MenuTile(
              icon: Icons.scoreboard,
              label: '스코어보드',
              onTap: () => _push(const AppWebViewScreen(
                path: WebRouteContracts.scoreboard,
                title: '스코어보드',
              )),
            ),
            _MenuTile(
              icon: Icons.admin_panel_settings,
              label: '관리자 패널',
              onTap: () => _push(const AppWebViewScreen(
                path: WebRouteContracts.admin,
                title: '관리자',
              )),
            ),
            _MenuTile(
              icon: Icons.edit_calendar,
              label: '일정 관리',
              onTap: () => _push(const AppWebViewScreen(
                path: WebRouteContracts.scheduleManage,
                title: '일정 관리',
              )),
            ),
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
              color: AppTheme.red500,
              onTap: _logout,
            )
          else
            _MenuTile(
              icon: Icons.login,
              label: '로그인',
              color: AppTheme.blue400,
              onTap: _login,
            ),
          const SizedBox(height: 32),
        ],
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
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Text(
        title,
        style: const TextStyle(
          color: AppTheme.slate400,
          fontSize: 12,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
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
    return ListTile(
      leading: Icon(icon, color: color ?? AppTheme.slate300),
      title: Text(label, style: TextStyle(color: color ?? Colors.white)),
      subtitle: value == null
          ? null
          : Text(
              value!,
              style: const TextStyle(color: AppTheme.slate500, fontSize: 12),
            ),
      trailing: Icon(Icons.chevron_right, color: color ?? AppTheme.slate500),
      onTap: onTap,
    );
  }
}
