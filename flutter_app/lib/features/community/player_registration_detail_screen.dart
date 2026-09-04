import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../core/models/player_registration_post.dart';
import '../../core/services/community_access_service.dart';
import '../../core/services/firestore_service.dart';
import '../../core/services/moderation_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/editor/rich_text_viewer.dart';
import '../../core/widgets/editor/delta_utils.dart';
import '../../core/widgets/moderation/e911_emergency_icon.dart';
import '../../core/widgets/moderation/moderation_dialogs.dart';
import 'player_registration_write_screen.dart';

enum _PlayerRegModerationAction {
  report,
  block,
}

class PlayerRegistrationDetailScreen extends StatefulWidget {
  const PlayerRegistrationDetailScreen({
    super.key,
    required this.post,
    required this.access,
  });

  final PlayerRegistrationPost post;
  final CommunityAccess access;

  @override
  State<PlayerRegistrationDetailScreen> createState() =>
      _PlayerRegistrationDetailScreenState();
}

class _PlayerRegistrationDetailScreenState
    extends State<PlayerRegistrationDetailScreen> {
  final _fs = FirestoreService();
  final _moderationService = ModerationService();
  late PlayerRegistrationPost _post;

  @override
  void initState() {
    super.initState();
    _post = widget.post;
  }

  bool _canWriteCategory(String category) {
    if (category == '선수 등록') return widget.access.canWritePlayerRegistration;
    return widget.access.canWriteUniformRegistration;
  }

  bool get _canEdit {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return false;
    if (widget.access.isAdmin) return true;
    return user.uid == _post.uid && _canWriteCategory(_post.category);
  }

  Color _categoryColor(String category) => switch (category) {
        '선수 등록' => context.aublColors.danger,
        '유니폼 등록' => context.aublColors.success,
        _ => context.aublColors.muted,
      };

  String _currentUserLabel(User user) {
    return user.displayName ?? user.email ?? user.uid;
  }

  String _clipPreview(String raw, {int maxLength = 180}) {
    final text = raw.replaceAll('\n', ' ').trim();
    if (text.length <= maxLength) return text;
    return '${text.substring(0, maxLength)}...';
  }

  Future<void> _handleModerationAction(
      _PlayerRegModerationAction action) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('로그인 후 신고/차단할 수 있습니다.')),
      );
      return;
    }
    if (_post.uid.isEmpty || _post.uid == user.uid) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('본인 계정은 신고하거나 차단할 수 없습니다.')),
      );
      return;
    }

    final reason = await showModerationReasonDialog(
      context,
      title: action == _PlayerRegModerationAction.block ? '사용자 차단' : '콘텐츠 신고',
      confirmLabel: action == _PlayerRegModerationAction.block ? '차단' : '신고',
    );
    if (reason == null) return;

    final payload = ModerationReportPayload(
      action: action == _PlayerRegModerationAction.block ? 'block' : 'report',
      reasonType: reason.reasonCode,
      reasonDetail: reason.detail,
      targetUid: _post.uid,
      targetLabel: _post.author,
      contentDomain: 'playerRegistrationPost',
      contentId: _post.id,
      contentPreview:
          _clipPreview('${_post.title}\n${deltaToPreviewText(_post.content)}'),
    );

    try {
      if (action == _PlayerRegModerationAction.block) {
        await _moderationService.blockUserAndReport(
          blockerUid: user.uid,
          blockerLabel: _currentUserLabel(user),
          payload: payload,
        );
      } else {
        await _moderationService.reportContent(
          reporterUid: user.uid,
          reporterLabel: _currentUserLabel(user),
          payload: payload,
        );
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            action == _PlayerRegModerationAction.block
                ? '사용자를 차단하고 운영팀에 신고했습니다.'
                : '신고가 접수되었습니다. 운영팀이 확인 후 조치합니다.',
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('신고 처리 중 오류가 발생했습니다: $e')),
      );
    }
  }

  Future<void> _deletePost() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.aublColors.surface,
        title: Text('삭제 확인', style: TextStyle(color: context.aublColors.ink)),
        content: Text(
          '게시글을 삭제하시겠습니까?',
          style: TextStyle(color: context.aublColors.ink),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('취소'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child:
                Text('삭제', style: TextStyle(color: context.aublColors.danger)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _fs.deletePlayerRegistrationPost(_post.id);
    if (mounted) Navigator.of(context).pop(true);
  }

  Future<void> _reload() async {
    final fresh = await _fs.getPlayerRegistrationPost(_post.id);
    if (fresh != null && mounted) {
      setState(() => _post = fresh);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    final canModeratePost = user != null &&
        _post.uid.isNotEmpty &&
        user.uid != _post.uid &&
        !_canEdit;

    return Scaffold(
      appBar: AppBar(
        title: const Text('선수 등록 게시판'),
        actions: [
          if (_canEdit) ...[
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              onPressed: () async {
                final updated = await Navigator.of(context).push<bool>(
                  MaterialPageRoute(
                    builder: (_) => PlayerRegistrationWriteScreen(
                      access: widget.access,
                      editPost: _post,
                    ),
                  ),
                );
                if (updated == true) {
                  await _reload();
                }
              },
            ),
            IconButton(
              icon:
                  Icon(Icons.delete_outline, color: context.aublColors.danger),
              onPressed: _deletePost,
            ),
          ],
          if (canModeratePost)
            PopupMenuButton<_PlayerRegModerationAction>(
              icon: E911EmergencyIcon(color: context.aublColors.muted),
              onSelected: _handleModerationAction,
              itemBuilder: (context) => [
                const PopupMenuItem(
                  value: _PlayerRegModerationAction.report,
                  child: Text('게시글 신고'),
                ),
                const PopupMenuItem(
                  value: _PlayerRegModerationAction.block,
                  child: Text('작성자 차단'),
                ),
              ],
            ),
        ],
      ),
      body: StreamBuilder<Set<String>>(
        stream: user == null
            ? Stream.value(<String>{})
            : _moderationService.watchBlockedUserIds(user.uid),
        builder: (context, blockedSnapshot) {
          final blockedUserIds = blockedSnapshot.data ?? <String>{};
          final isPostBlocked = blockedUserIds.contains(_post.uid);

          if (isPostBlocked) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 48),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.block,
                      size: 56,
                      color: context.aublColors.muted,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      '차단한 사용자의 게시글입니다.',
                      style: TextStyle(
                        color: context.aublColors.ink,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '계정 화면에서 차단을 해제하면 다시 볼 수 있습니다.',
                      style: TextStyle(
                        color: context.aublColors.muted,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Wrap(
                spacing: 6,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  _badge(_post.category, _categoryColor(_post.category)),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                _post.title,
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: context.aublColors.ink,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '${_post.author} · ${timeago.format(DateTime.fromMillisecondsSinceEpoch(_post.createdAt), locale: 'ko')}',
                style: TextStyle(color: context.aublColors.muted, fontSize: 12),
              ),
              const SizedBox(height: 8),
              Text(
                '우측 상단 메뉴에서 게시글 신고 또는 작성자 차단이 가능합니다.',
                style: TextStyle(color: context.aublColors.muted, fontSize: 11),
              ),
              const Divider(height: 28),
              RichTextViewer(
                content: _post.content,
                fontSize: 14,
                color: context.aublColors.ink,
                lineHeight: 1.7,
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _badge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(5),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
