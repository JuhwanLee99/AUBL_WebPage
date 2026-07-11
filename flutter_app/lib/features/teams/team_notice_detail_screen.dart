import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../core/models/notice_comment.dart';
import '../../core/models/team_notice.dart';
import '../../core/services/firestore_service.dart';
import '../../core/services/moderation_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/editor/delta_utils.dart';
import '../../core/widgets/moderation/e911_emergency_icon.dart';
import '../../core/widgets/editor/rich_text_editor.dart';
import '../../core/widgets/editor/rich_text_viewer.dart';
import '../../core/widgets/moderation/moderation_dialogs.dart';

enum _TeamNoticeModerationAction {
  report,
  block,
  delete,
}

class TeamNoticeDetailScreen extends StatefulWidget {
  const TeamNoticeDetailScreen({
    super.key,
    required this.teamId,
    required this.teamName,
    required this.notice,
    required this.canManage,
  });

  final String teamId;
  final String teamName;
  final TeamNotice notice;
  final bool canManage;

  @override
  State<TeamNoticeDetailScreen> createState() => _TeamNoticeDetailScreenState();
}

class _TeamNoticeDetailScreenState extends State<TeamNoticeDetailScreen> {
  final _fs = FirestoreService();
  final _moderationService = ModerationService();
  String _commentDelta = '';
  int _editorKey = 0;
  String? _replyToId;

  String _currentUserLabel(User user) {
    return user.displayName ?? user.email ?? user.uid;
  }

  String _clipPreview(String raw, {int maxLength = 180}) {
    final text = raw.replaceAll('\n', ' ').trim();
    if (text.length <= maxLength) return text;
    return '${text.substring(0, maxLength)}...';
  }

  Future<void> _handleCommentModeration({
    required _TeamNoticeModerationAction action,
    required NoticeComment comment,
  }) async {
    if (action == _TeamNoticeModerationAction.delete) {
      await _fs.deleteTeamNoticeComment(
        widget.teamId,
        widget.notice.id,
        comment.id,
      );
      return;
    }

    final viewer = FirebaseAuth.instance.currentUser;
    if (viewer == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('로그인 후 신고/차단할 수 있습니다.')),
      );
      return;
    }
    if (comment.uid.isEmpty || comment.uid == viewer.uid) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('본인 계정은 신고하거나 차단할 수 없습니다.')),
      );
      return;
    }

    final reason = await showModerationReasonDialog(
      context,
      title: action == _TeamNoticeModerationAction.block ? '사용자 차단' : '콘텐츠 신고',
      confirmLabel: action == _TeamNoticeModerationAction.block ? '차단' : '신고',
    );
    if (reason == null) return;

    final payload = ModerationReportPayload(
      action: action == _TeamNoticeModerationAction.block ? 'block' : 'report',
      reasonType: reason.reasonCode,
      reasonDetail: reason.detail,
      targetUid: comment.uid,
      targetLabel: comment.author,
      contentDomain: 'teamNoticeComment',
      contentId: comment.id,
      parentContentId: widget.notice.id,
      contextId: widget.teamId,
      contentPreview: _clipPreview(deltaToPreviewText(comment.content)),
    );

    try {
      if (action == _TeamNoticeModerationAction.block) {
        await _moderationService.blockUserAndReport(
          blockerUid: viewer.uid,
          blockerLabel: _currentUserLabel(viewer),
          payload: payload,
        );
      } else {
        await _moderationService.reportContent(
          reporterUid: viewer.uid,
          reporterLabel: _currentUserLabel(viewer),
          payload: payload,
        );
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            action == _TeamNoticeModerationAction.block
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

  Future<void> _postComment() async {
    if (isDeltaEmpty(_commentDelta)) return;
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final content = _commentDelta;
    setState(() {
      _commentDelta = '';
      _editorKey++;
      _replyToId = null;
    });
    await _fs.addTeamNoticeComment(
      widget.teamId,
      widget.notice.id,
      NoticeComment(
        id: '',
        uid: user.uid,
        author: user.email?.split('@').first ?? '익명',
        content: content,
        createdAt: DateTime.now().millisecondsSinceEpoch,
        parentId: _replyToId,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    return Scaffold(
      appBar: AppBar(title: const Text('공지 상세')),
      body: StreamBuilder<Set<String>>(
        stream: user == null
            ? Stream.value(<String>{})
            : _moderationService.watchBlockedUserIds(user.uid),
        builder: (context, blockedSnapshot) {
          final blockedUserIds = blockedSnapshot.data ?? const <String>{};

          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text(
                      widget.notice.title,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Text(
                          widget.notice.createdByName ?? '',
                          style: const TextStyle(
                              color: AppTheme.slate400, fontSize: 13),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          timeago.format(
                            DateTime.fromMillisecondsSinceEpoch(
                                widget.notice.createdAt),
                            locale: 'ko',
                          ),
                          style: const TextStyle(
                              color: AppTheme.slate500, fontSize: 12),
                        ),
                      ],
                    ),
                    const Divider(height: 24),
                    RichTextViewer(
                        content: widget.notice.content,
                        fontSize: 14,
                        color: AppTheme.slate300),
                    const SizedBox(height: 24),
                    const Text(
                      '댓글',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      '댓글 우측 메뉴에서 신고 또는 차단할 수 있습니다.',
                      style: TextStyle(color: AppTheme.slate500, fontSize: 11),
                    ),
                    const SizedBox(height: 8),
                    StreamBuilder<List<NoticeComment>>(
                      stream: _fs.watchTeamNoticeComments(
                          widget.teamId, widget.notice.id),
                      builder: (context, snap) {
                        if (snap.hasError) {
                          final err = snap.error;
                          if (err is FirebaseException &&
                              err.code == 'permission-denied') {
                            return const Padding(
                              padding: EdgeInsets.symmetric(vertical: 16),
                              child: Text(
                                '댓글은 해당 팀 선수/감독만 열람할 수 있습니다.',
                                style: TextStyle(color: AppTheme.red500),
                              ),
                            );
                          }
                          return const Padding(
                            padding: EdgeInsets.symmetric(vertical: 16),
                            child: Text(
                              '댓글을 불러오지 못했습니다.',
                              style: TextStyle(color: AppTheme.red500),
                            ),
                          );
                        }

                        final comments = (snap.data ?? [])
                            .where((comment) =>
                                !blockedUserIds.contains(comment.uid))
                            .toList();
                        if (comments.isEmpty) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(vertical: 16),
                            child: Text('아직 댓글이 없습니다.',
                                style: TextStyle(color: AppTheme.slate500)),
                          );
                        }

                        final topLevel =
                            comments.where((c) => c.parentId == null).toList();
                        return Column(
                          children: topLevel.map((comment) {
                            final replies = comments
                                .where((c) => c.parentId == comment.id)
                                .toList();
                            return _CommentTile(
                              comment: comment,
                              replies: replies,
                              currentUid:
                                  FirebaseAuth.instance.currentUser?.uid ?? '',
                              onReply: () =>
                                  setState(() => _replyToId = comment.id),
                              onLike: () {
                                final currentUser =
                                    FirebaseAuth.instance.currentUser;
                                if (currentUser == null) return;
                                _fs.toggleCommentLike(
                                  widget.teamId,
                                  widget.notice.id,
                                  comment.id,
                                  currentUser.uid,
                                );
                              },
                              canManage: widget.canManage,
                              onAction: (action, targetComment) =>
                                  _handleCommentModeration(
                                action: action,
                                comment: targetComment,
                              ),
                            );
                          }).toList(),
                        );
                      },
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                decoration: const BoxDecoration(
                  color: AppTheme.slate800,
                  border: Border(top: BorderSide(color: AppTheme.slate700)),
                ),
                child: SafeArea(
                  top: false,
                  child: user == null
                      ? Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              constraints: const BoxConstraints(minHeight: 60),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 18),
                              decoration: BoxDecoration(
                                color: const Color(0xFF1e293b),
                                borderRadius: BorderRadius.circular(10),
                                border:
                                    Border.all(color: const Color(0xFF334155)),
                              ),
                              child: const Text(
                                '로그인이 필요합니다.',
                                style: TextStyle(
                                  color: AppTheme.slate400,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            const SizedBox(height: 6),
                            const Align(
                              alignment: Alignment.centerRight,
                              child: Icon(Icons.send, color: AppTheme.slate600),
                            ),
                          ],
                        )
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (_replyToId != null)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 4),
                                child: Row(
                                  children: [
                                    const Text('답글 작성 중',
                                        style: TextStyle(
                                            color: AppTheme.blue400,
                                            fontSize: 12)),
                                    const Spacer(),
                                    GestureDetector(
                                      onTap: () =>
                                          setState(() => _replyToId = null),
                                      child: const Text('취소',
                                          style: TextStyle(
                                              color: AppTheme.slate400,
                                              fontSize: 12)),
                                    ),
                                  ],
                                ),
                              ),
                            RichTextEditor(
                              key: ValueKey(_editorKey),
                              onChanged: (v) => _commentDelta = v,
                              mini: true,
                              placeholder: '댓글을 입력하세요...',
                              minHeight: 60,
                            ),
                            const SizedBox(height: 6),
                            Align(
                              alignment: Alignment.centerRight,
                              child: IconButton(
                                icon: const Icon(Icons.send,
                                    color: AppTheme.blue400),
                                onPressed: _postComment,
                              ),
                            ),
                          ],
                        ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _CommentTile extends StatelessWidget {
  const _CommentTile({
    required this.comment,
    required this.replies,
    required this.currentUid,
    required this.canManage,
    this.onReply,
    this.onLike,
    this.onAction,
  });

  final NoticeComment comment;
  final List<NoticeComment> replies;
  final String currentUid;
  final bool canManage;
  final VoidCallback? onReply;
  final VoidCallback? onLike;
  final void Function(
      _TeamNoticeModerationAction action, NoticeComment comment)? onAction;

  @override
  Widget build(BuildContext context) {
    final isLiked = comment.likedBy.contains(currentUid);
    final isMine = comment.uid == currentUid;
    final canDelete = isMine || canManage;
    final canReport =
        currentUid.isNotEmpty && comment.uid.isNotEmpty && !isMine;
    final showMenu = canDelete || canReport;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(comment.author,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w500)),
              const SizedBox(width: 8),
              Text(
                timeago.format(
                    DateTime.fromMillisecondsSinceEpoch(comment.createdAt),
                    locale: 'ko'),
                style: const TextStyle(color: AppTheme.slate500, fontSize: 11),
              ),
              if (showMenu) ...[
                const Spacer(),
                PopupMenuButton<_TeamNoticeModerationAction>(
                  padding: EdgeInsets.zero,
                  icon: const E911EmergencyIcon(
                    size: 18,
                    color: Color(0xFFE3E3E3),
                  ),
                  onSelected: (action) => onAction?.call(action, comment),
                  itemBuilder: (context) {
                    final items =
                        <PopupMenuEntry<_TeamNoticeModerationAction>>[];
                    if (canDelete) {
                      items.add(
                        const PopupMenuItem(
                          value: _TeamNoticeModerationAction.delete,
                          child: Text('댓글 삭제'),
                        ),
                      );
                    }
                    if (canReport) {
                      if (items.isNotEmpty) {
                        items.add(const PopupMenuDivider());
                      }
                      items.addAll(const [
                        PopupMenuItem(
                          value: _TeamNoticeModerationAction.report,
                          child: Text('댓글 신고'),
                        ),
                        PopupMenuItem(
                          value: _TeamNoticeModerationAction.block,
                          child: Text('작성자 차단'),
                        ),
                      ]);
                    }
                    return items;
                  },
                ),
              ],
            ],
          ),
          const SizedBox(height: 4),
          RichTextViewer(
              content: comment.content, fontSize: 13, color: AppTheme.slate300),
          const SizedBox(height: 4),
          Row(
            children: [
              GestureDetector(
                onTap: onLike,
                child: Row(
                  children: [
                    Icon(
                      isLiked ? Icons.favorite : Icons.favorite_border,
                      size: 14,
                      color: isLiked ? AppTheme.red500 : AppTheme.slate500,
                    ),
                    if (comment.likeCount > 0) ...[
                      const SizedBox(width: 2),
                      Text('${comment.likeCount}',
                          style: const TextStyle(
                              color: AppTheme.slate500, fontSize: 11)),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 16),
              GestureDetector(
                onTap: onReply,
                child: const Text('답글',
                    style: TextStyle(color: AppTheme.slate500, fontSize: 11)),
              ),
            ],
          ),
          // 대댓글
          if (replies.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 20, top: 8),
              child: Column(
                children: replies
                    .map((r) => Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text(r.author,
                                      style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 12,
                                          fontWeight: FontWeight.w500)),
                                  const SizedBox(width: 6),
                                  Text(
                                    timeago.format(
                                        DateTime.fromMillisecondsSinceEpoch(
                                            r.createdAt),
                                        locale: 'ko'),
                                    style: const TextStyle(
                                        color: AppTheme.slate500, fontSize: 10),
                                  ),
                                  const Spacer(),
                                  if ((r.uid == currentUid || canManage) ||
                                      (currentUid.isNotEmpty &&
                                          r.uid.isNotEmpty &&
                                          r.uid != currentUid))
                                    PopupMenuButton<
                                        _TeamNoticeModerationAction>(
                                      padding: EdgeInsets.zero,
                                      icon: const E911EmergencyIcon(
                                        size: 16,
                                        color: Color(0xFFE3E3E3),
                                      ),
                                      onSelected: (action) =>
                                          onAction?.call(action, r),
                                      itemBuilder: (context) {
                                        final isReplyMine = r.uid == currentUid;
                                        final canDeleteReply =
                                            isReplyMine || canManage;
                                        final canReportReply =
                                            currentUid.isNotEmpty &&
                                                r.uid.isNotEmpty &&
                                                !isReplyMine;
                                        final items = <PopupMenuEntry<
                                            _TeamNoticeModerationAction>>[];
                                        if (canDeleteReply) {
                                          items.add(
                                            const PopupMenuItem(
                                              value: _TeamNoticeModerationAction
                                                  .delete,
                                              child: Text('댓글 삭제'),
                                            ),
                                          );
                                        }
                                        if (canReportReply) {
                                          if (items.isNotEmpty) {
                                            items.add(const PopupMenuDivider());
                                          }
                                          items.addAll(const [
                                            PopupMenuItem(
                                              value: _TeamNoticeModerationAction
                                                  .report,
                                              child: Text('댓글 신고'),
                                            ),
                                            PopupMenuItem(
                                              value: _TeamNoticeModerationAction
                                                  .block,
                                              child: Text('작성자 차단'),
                                            ),
                                          ]);
                                        }
                                        return items;
                                      },
                                    ),
                                ],
                              ),
                              const SizedBox(height: 2),
                              RichTextViewer(
                                  content: r.content,
                                  fontSize: 12,
                                  color: AppTheme.slate400),
                            ],
                          ),
                        ))
                    .toList(),
              ),
            ),
        ],
      ),
    );
  }
}
