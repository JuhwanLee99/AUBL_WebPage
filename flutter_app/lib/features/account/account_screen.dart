import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/theme/app_theme.dart';
import '../../core/services/firestore_service.dart';
import '../auth/login_webview_screen.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  final _fs = FirestoreService();
  bool _loading = true;
  bool _isAdmin = false;
  String _roleLabel = '일반';
  String _roleDetail = '사용자';

  @override
  void initState() {
    super.initState();
    _loadRole();
  }

  Future<void> _loadRole() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    try {
      final token = await user.getIdTokenResult(true);
      final admin = token.claims?['admin'] == true;
      String roleLabel = '일반';
      String roleDetail = '사용자';

      if (admin) {
        roleLabel = '관리자';
        roleDetail = '정식 승인';
      } else {
        final roleDoc = await FirebaseFirestore.instance
            .collection('roles')
            .doc(user.uid)
            .get();
        final data = roleDoc.data();
        if (roleDoc.exists && data?['role'] == 'coach') {
          roleLabel = '감독';
          roleDetail = data?['teamName'] as String? ??
              data?['teamId'] as String? ??
              '감독';
        } else {
          final membership = await _fs.findUserTeamMembership(user.uid);
          if (membership != null) {
            final role = membership['role'] as String? ?? 'player';
            roleLabel = switch (role) {
              'coach' => '감독',
              'staff' => '스태프',
              _ => '선수',
            };
            final teamId = membership['teamId'] as String?;
            if (teamId != null) {
              final team = await _fs.getTeam(teamId);
              roleDetail = team?.name ?? teamId;
            } else {
              roleDetail = '팀 소속';
            }
          }
        }
      }

      if (mounted) {
        setState(() {
          _isAdmin = admin;
          _roleLabel = roleLabel;
          _roleDetail = roleDetail;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _logout() async {
    try {
      await GoogleSignIn().signOut();
    } catch (_) {}
    await FirebaseAuth.instance.signOut();
    await WebViewCookieManager().clearCookies();
    if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    return Scaffold(
      appBar: AppBar(title: const Text('계정')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : user == null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.person_outline,
                          size: 48, color: AppTheme.slate500),
                      const SizedBox(height: 16),
                      const Text('로그인이 필요합니다.',
                          style: TextStyle(color: AppTheme.slate400)),
                      const SizedBox(height: 16),
                      ElevatedButton.icon(
                        onPressed: () async {
                          await Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) => const LoginWebViewScreen(),
                            ),
                          );
                          if (mounted) _loadRole();
                        },
                        icon: const Icon(Icons.login),
                        label: const Text('로그인'),
                      ),
                    ],
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    // 프로필 카드
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: AppTheme.slate800,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppTheme.slate700),
                      ),
                      child: Column(
                        children: [
                          CircleAvatar(
                            radius: 32,
                            backgroundColor: _isAdmin
                                ? AppTheme.blue500
                                : AppTheme.slate600,
                            child: Text(
                              (user.email ?? '?')[0].toUpperCase(),
                              style: const TextStyle(
                                  fontSize: 24, color: Colors.white),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            user.email ?? '-',
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                                fontWeight: FontWeight.w500),
                          ),
                          const SizedBox(height: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 4),
                            decoration: BoxDecoration(
                              gradient: _isAdmin
                                  ? const LinearGradient(colors: [
                                      AppTheme.blue500,
                                      Color(0xFF8B5CF6),
                                    ])
                                  : null,
                              color: _isAdmin ? null : AppTheme.slate700,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              _roleLabel,
                              style: const TextStyle(
                                  color: Colors.white, fontSize: 12),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    _infoRow('UID', user.uid),
                    _infoRow('이메일', user.email ?? '-'),
                    _infoRow('제공자',
                        user.providerData.map((p) => p.providerId).join(', ')),
                    _infoRow('역할', '$_roleLabel ($_roleDetail)'),
                    _infoRow(
                        '생성일',
                        user.metadata.creationTime
                                ?.toLocal()
                                .toString()
                                .substring(0, 16) ??
                            '-'),
                    _infoRow(
                        '마지막 로그인',
                        user.metadata.lastSignInTime
                                ?.toLocal()
                                .toString()
                                .substring(0, 16) ??
                            '-'),

                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: _logout,
                        icon: const Icon(Icons.logout, color: AppTheme.red500),
                        label: const Text('로그아웃',
                            style: TextStyle(color: AppTheme.red500)),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: AppTheme.red500),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 90,
            child: Text(label,
                style: const TextStyle(
                    color: AppTheme.slate500, fontSize: 13)),
          ),
          Expanded(
            child: Text(value,
                style: const TextStyle(color: AppTheme.slate300, fontSize: 13)),
          ),
        ],
      ),
    );
  }
}
