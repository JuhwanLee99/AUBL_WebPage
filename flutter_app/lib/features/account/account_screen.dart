import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/config/app_config.dart';
import '../../core/services/account_deletion_service.dart';
import '../../core/services/auth_session_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/services/firestore_service.dart';
import '../../core/services/moderation_service.dart';
import '../../core/services/notification_service.dart';
import '../../core/widgets/season_components.dart';
import '../auth/login_webview_screen.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  final _fs = FirestoreService();
  final _moderationService = ModerationService();
  final _accountDeletionService = AccountDeletionService();
  bool _loading = true;
  bool _deleting = false;
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
        if (roleDoc.exists && data?['role'] == 'scorer') {
          roleLabel = '기록원';
          roleDetail = '기록/중계';
        } else if (roleDoc.exists && data?['role'] == 'coach') {
          roleLabel = '감독';
          roleDetail =
              data?['teamName'] as String? ??
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
    await AuthSessionService.signOutFast();
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
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('브라우저를 열 수 없습니다.')));
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
                backgroundColor: context.aublColors.danger,
                foregroundColor: Theme.of(context).colorScheme.onError,
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
      await AuthSessionService.signOutFast();
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('회원 탈퇴가 완료되었습니다.')));
      Navigator.of(context).popUntil((r) => r.isFirst);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(_formatDeletionError(e))));
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
          : SafeArea(
              top: false,
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final gutter = constraints.maxWidth < 520 ? 12.0 : 24.0;
                  return Align(
                    alignment: Alignment.topCenter,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 960),
                      child: ListView(
                        padding: EdgeInsets.fromLTRB(gutter, 8, gutter, 32),
                        children: [
                          const SeasonPageHero(
                            eyebrow: 'AUBL ACCOUNT',
                            title: Text('내 계정'),
                            description: '로그인 정보와 권한, 커뮤니티 설정을 관리하세요.',
                          ),
                          const SizedBox(height: 14),
                          if (user == null)
                            _buildSignedOutState()
                          else ...[
                            _buildProfilePanel(user),
                            const SizedBox(height: 14),
                            SeasonSectionPanel(
                              eyebrow: 'ACCOUNT DATA',
                              title: '계정 정보',
                              child: Column(
                                children: [
                                  _infoRow('UID', user.uid),
                                  _infoRow('이메일', user.email ?? '-'),
                                  _infoRow(
                                    '제공자',
                                    user.providerData
                                        .map((provider) => provider.providerId)
                                        .join(', '),
                                  ),
                                  _infoRow('역할', '$_roleLabel ($_roleDetail)'),
                                  _infoRow(
                                    '생성일',
                                    user.metadata.creationTime
                                            ?.toLocal()
                                            .toString()
                                            .substring(0, 16) ??
                                        '-',
                                  ),
                                  _infoRow(
                                    '마지막 로그인',
                                    user.metadata.lastSignInTime
                                            ?.toLocal()
                                            .toString()
                                            .substring(0, 16) ??
                                        '-',
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 14),
                            _buildBlockedUsersSection(user),
                            const SizedBox(height: 14),
                            _buildAccountActions(),
                          ],
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
    );
  }

  Widget _buildSignedOutState() {
    return SeasonSectionPanel(
      eyebrow: 'SIGN IN',
      title: '로그인이 필요합니다',
      description: '계정 기능과 팀 권한을 사용하려면 로그인해 주세요.',
      child: Align(
        alignment: Alignment.centerLeft,
        child: SeasonActionButton(
          label: '로그인 / 회원가입',
          icon: Icons.login,
          onPressed: () async {
            await Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => const LoginWebViewScreen(),
              ),
            );
            if (mounted) _loadRole();
          },
        ),
      ),
    );
  }

  Widget _buildProfilePanel(User user) {
    final identity = (user.email ?? '').trim();
    final initial = identity.isEmpty
        ? 'A'
        : identity.characters.first.toUpperCase();
    return SeasonSectionPanel(
      eyebrow: 'MEMBERSHIP',
      title: '프로필',
      child: LayoutBuilder(
        builder: (context, constraints) {
          final stack =
              constraints.maxWidth < 520 ||
              MediaQuery.textScalerOf(context).scale(1) >= 1.5;
          final avatar = Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: context.aublColors.surfaceMuted,
              borderRadius: BorderRadius.circular(4),
              border: Border.all(color: context.aublColors.lineStrong),
            ),
            alignment: Alignment.center,
            child: Text(
              initial,
              style: TextStyle(
                color: context.aublColors.navy,
                fontFamily: 'BarlowCondensed',
                fontSize: 30,
                fontWeight: FontWeight.w900,
              ),
            ),
          );
          final detail = Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                identity.isEmpty ? '이메일 정보 없음' : identity,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              SeasonStatusBadge(label: _roleLabel, tone: SeasonBadgeTone.blue),
              const SizedBox(height: 6),
              Text(_roleDetail, style: Theme.of(context).textTheme.bodySmall),
            ],
          );
          if (stack) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [avatar, const SizedBox(height: 14), detail],
            );
          }
          return Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              avatar,
              const SizedBox(width: 16),
              Expanded(child: detail),
            ],
          );
        },
      ),
    );
  }

  Widget _buildAccountActions() {
    return SeasonSectionPanel(
      eyebrow: 'SECURITY',
      title: '계정 관리',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          OutlinedButton.icon(
            onPressed: _logout,
            icon: const Icon(Icons.logout),
            label: const Text('로그아웃'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _openAccountDeletionUrl,
            icon: const Icon(Icons.open_in_new),
            label: const Text('웹에서 계정 삭제 안내 열기'),
          ),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: _deleting ? null : _deleteAccount,
            icon: _deleting
                ? const SizedBox.square(
                    dimension: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.person_remove),
            label: Text(_deleting ? '탈퇴 처리 중...' : '회원 탈퇴'),
            style: FilledButton.styleFrom(
              backgroundColor: context.aublColors.danger,
              foregroundColor: Theme.of(context).colorScheme.onError,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            '회원 탈퇴 시 인증 계정과 기본 프로필 데이터가 삭제됩니다.\n'
            '커뮤니티 게시물은 운영 정책에 따라 일부 유지될 수 있습니다.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }

  Widget _buildBlockedUsersSection(User user) {
    return SeasonSectionPanel(
      eyebrow: 'COMMUNITY SAFETY',
      title: '차단한 사용자',
      description: '차단한 사용자의 게시글과 댓글은 커뮤니티에서 숨겨집니다.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          StreamBuilder<List<BlockedUserEntry>>(
            stream: _moderationService.watchBlockedUsers(user.uid),
            builder: (context, snapshot) {
              final blockedUsers = snapshot.data ?? <BlockedUserEntry>[];
              if (blockedUsers.isEmpty) {
                return Text(
                  '현재 차단한 사용자가 없습니다.',
                  style: TextStyle(
                    color: context.aublColors.muted,
                    fontSize: 12,
                  ),
                );
              }

              return Column(
                children: blockedUsers.map((entry) {
                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: context.aublColors.surfaceMuted,
                      borderRadius: BorderRadius.circular(3),
                      border: Border.all(color: context.aublColors.line),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                entry.label,
                                style: TextStyle(
                                  color: context.aublColors.ink,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                entry.uid,
                                style: TextStyle(
                                  color: context.aublColors.muted,
                                  fontSize: 11,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                        TextButton(
                          onPressed: () async {
                            await _moderationService.unblockUser(
                              blockerUid: user.uid,
                              blockedUid: entry.uid,
                            );
                            if (!context.mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('사용자 차단을 해제했습니다.')),
                            );
                          },
                          child: Text(
                            '차단 해제',
                            style: TextStyle(
                              color: context.aublColors.cobalt,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    final labelWidget = Text(
      label,
      style: Theme.of(
        context,
      ).textTheme.labelMedium?.copyWith(color: context.aublColors.muted),
    );
    final valueWidget = SelectableText(
      value,
      style: Theme.of(context).textTheme.bodyMedium,
    );
    return LayoutBuilder(
      builder: (context, constraints) {
        final stack =
            constraints.maxWidth < 420 ||
            MediaQuery.textScalerOf(context).scale(1) >= 1.5;
        return Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: context.aublColors.line)),
          ),
          child: stack
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    labelWidget,
                    const SizedBox(height: 4),
                    valueWidget,
                  ],
                )
              : Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: 120, child: labelWidget),
                    Expanded(child: valueWidget),
                  ],
                ),
        );
      },
    );
  }
}
