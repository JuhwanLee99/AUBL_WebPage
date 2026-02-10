import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../core/theme/app_theme.dart';
import '../core/webview/app_webview_screen.dart';
import '../features/account/account_screen.dart';
import '../features/auth/login_webview_screen.dart';
import '../features/intro/intro_screen.dart';
import '../features/intro/rules_screen.dart';
import '../features/prediction/prediction_screen.dart';
import '../features/standings/standings_screen.dart';

class MoreScreen extends StatefulWidget {
  const MoreScreen({super.key});

  @override
  State<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends State<MoreScreen> {
  bool _isAdmin = false;
  bool _checking = true;
  bool _loggedIn = false;

  @override
  void initState() {
    super.initState();
    _checkAuth();
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('더보기')),
      body: ListView(
        children: [
          const _SectionTitle('일반'),
          _MenuTile(
            icon: Icons.emoji_events,
            label: '순위',
            onTap: () => _push(const StandingsScreen()),
          ),
          _MenuTile(
            icon: Icons.person,
            label: '계정',
            onTap: () => _push(const AccountScreen()),
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
          _MenuTile(
            icon: Icons.analytics,
            label: '승부예측',
            onTap: () => _push(const PredictionScreen()),
          ),

          if (!_checking && _loggedIn && _isAdmin) ...[
            const Divider(height: 32),
            const _SectionTitle('관리자'),
            _MenuTile(
              icon: Icons.fact_check,
              label: '기록원',
              onTap: () => _push(const AppWebViewScreen(
                path: '/scorekeeper',
                title: '기록원',
              )),
            ),
            _MenuTile(
              icon: Icons.scoreboard,
              label: '스코어보드',
              onTap: () => _push(const AppWebViewScreen(
                path: '/scoreboard',
                title: '스코어보드',
              )),
            ),
            _MenuTile(
              icon: Icons.admin_panel_settings,
              label: '관리자 패널',
              onTap: () => _push(const AppWebViewScreen(
                path: '/admin',
                title: '관리자',
              )),
            ),
            _MenuTile(
              icon: Icons.edit_calendar,
              label: '일정 관리',
              onTap: () => _push(const AppWebViewScreen(
                path: '/schedule/manage',
                title: '일정 관리',
              )),
            ),
          ],

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
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: color ?? AppTheme.slate300),
      title: Text(label, style: TextStyle(color: color ?? Colors.white)),
      trailing: Icon(Icons.chevron_right, color: color ?? AppTheme.slate500),
      onTap: onTap,
    );
  }
}
