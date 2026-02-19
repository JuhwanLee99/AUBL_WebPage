import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/config/app_config.dart';
import '../../core/services/account_deletion_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/services/firestore_service.dart';
import '../../core/services/notification_service.dart';
import '../auth/login_webview_screen.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  final _fs = FirestoreService();
  final _accountDeletionService = AccountDeletionService();
  bool _loading = true;
  bool _deleting = false;
  bool _isAdmin = false;
  String _roleLabel = '일반';
  String _roleDetail = '사용자';

  Color _roleAccent() {
    if (_isAdmin) return AppTheme.blue500;
    switch (_roleLabel) {
      case '감독':
        return const Color(0xFFF97316);
      case '스태프':
        return const Color(0xFF22C55E);
      case '선수':
        return const Color(0xFF38BDF8);
      default:
        return AppTheme.slate600;
    }
  }

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

  Future<void> _openAccountDeletionUrl() async {
    final uri = Uri.tryParse(AppConfig.accountDeletionUrl);
    if (uri == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('계정 삭제 안내 URL이 올바르지 않습니다.')),
        );
      }
      return;
    }
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('브라우저를 열 수 없습니다.')),
      );
    }
  }

  Future<String?> _promptPassword() async {
    final controller = TextEditingController();
    try {
      return await showDialog<String>(
        context: context,
        builder: (context) {
          return AlertDialog(
            title: const Text('비밀번호 재확인'),
            content: TextField(
              controller: controller,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: '현재 비밀번호',
                hintText: '계정 삭제를 위해 필요합니다.',
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('취소'),
              ),
              FilledButton(
                onPressed: () {
                  final value = controller.text.trim();
                  if (value.isEmpty) return;
                  Navigator.of(context).pop(value);
                },
                child: const Text('확인'),
              ),
            ],
          );
        },
      );
    } finally {
      controller.dispose();
    }
  }

  String _formatDeletionError(Object error) {
    if (error is AccountDeletionException) return error.message;
    if (error is FirebaseAuthException) {
      switch (error.code) {
        case 'requires-recent-login':
          return '보안을 위해 최근 로그인 재인증이 필요합니다.';
        case 'wrong-password':
        case 'invalid-credential':
          return '재인증에 실패했습니다. 입력 정보를 다시 확인해 주세요.';
        case 'user-mismatch':
          return '재인증한 계정이 현재 계정과 일치하지 않습니다.';
        case 'network-request-failed':
          return '네트워크 오류로 계정 삭제에 실패했습니다.';
        default:
          return '계정 삭제에 실패했습니다. (${error.code})';
      }
    }
    if (error is FirebaseException) {
      if (error.code == 'permission-denied') {
        return '사용자 데이터 삭제 권한이 없습니다. 운영팀에 문의해 주세요.';
      }
      return '데이터 삭제 중 오류가 발생했습니다. (${error.code})';
    }
    return '계정 삭제 중 알 수 없는 오류가 발생했습니다.';
  }

  Future<void> _deleteAccount() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null || _deleting) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('회원 탈퇴'),
          content: const Text(
            '탈퇴 시 계정 정보가 삭제되며 복구할 수 없습니다.\n'
            '커뮤니티에 작성한 게시물은 정책에 따라 남아 있을 수 있습니다.\n\n'
            '계속 진행하시겠습니까?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('취소'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              style: FilledButton.styleFrom(
                backgroundColor: AppTheme.red500,
                foregroundColor: Colors.white,
              ),
              child: const Text('탈퇴 진행'),
            ),
          ],
        );
      },
    );
    if (confirmed != true) return;

    String? password;
    if (_accountDeletionService.resolveCurrentProvider(user) ==
        AccountDeletionProvider.password) {
      password = await _promptPassword();
      if (password == null || password.isEmpty) return;
    }

    if (!mounted) return;
    setState(() => _deleting = true);
    try {
      await NotificationService.instance.updateUserInquiryTopic(null);
      await _accountDeletionService.deleteCurrentUser(
        currentPassword: password,
      );
      try {
        await GoogleSignIn().signOut();
      } catch (_) {}
      await WebViewCookieManager().clearCookies();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('회원 탈퇴가 완료되었습니다.')),
      );
      Navigator.of(context).popUntil((r) => r.isFirst);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_formatDeletionError(e))),
      );
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
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
                            backgroundColor: _roleAccent(),
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
                              color: _isAdmin
                                  ? null
                                  : _roleAccent().withValues(alpha: 0.2),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                  color: _roleAccent().withValues(alpha: 0.5)),
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
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: _openAccountDeletionUrl,
                        icon: const Icon(Icons.open_in_new,
                            color: AppTheme.slate300),
                        label: const Text('웹에서 계정 삭제 안내 열기',
                            style: TextStyle(color: AppTheme.slate300)),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: AppTheme.slate600),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _deleting ? null : _deleteAccount,
                        icon: _deleting
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.person_remove),
                        label: Text(_deleting ? '탈퇴 처리 중...' : '회원 탈퇴'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.red500,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      '회원 탈퇴 시 인증 계정과 기본 프로필 데이터가 삭제됩니다.\n'
                      '커뮤니티 게시물은 운영 정책에 따라 일부 유지될 수 있습니다.',
                      style: TextStyle(
                        color: AppTheme.slate500,
                        fontSize: 12,
                        height: 1.5,
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
                style: const TextStyle(color: AppTheme.slate500, fontSize: 13)),
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
