import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../core/models/notice_comment.dart';
import '../../core/models/team_notice.dart';
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';

class TeamNoticeDetailScreen extends StatefulWidget {
  const TeamNoticeDetailScreen({
    super.key,
    required this.teamId,
    required this.teamName,
    required this.notice,
  });

  final String teamId;
  final String teamName;
  final TeamNotice notice;

  @override
  State<TeamNoticeDetailScreen> createState() =>
      _TeamNoticeDetailScreenState();
}

class _TeamNoticeDetailScreenState extends State<TeamNoticeDetailScreen> {
  final _fs = FirestoreService();
  final _commentCtrl = TextEditingController();
  String? _replyToId;

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _postComment() async {
    final text = _commentCtrl.text.trim();
    if (text.isEmpty) return;
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    await _fs.addTeamNoticeComment(
      widget.teamId,
      widget.notice.id,
      NoticeComment(
        id: '',
        uid: user.uid,
        author: user.email?.split('@').first ?? '익명',
        content: text,
        createdAt: DateTime.now().millisecondsSinceEpoch,
        parentId: _replyToId,
      ),
    );
    _commentCtrl.clear();
    if (mounted) setState(() => _replyToId = null);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('공지 상세')),
      body: Column(
        children: [
          // ── 공지 본문 ──
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
                Text(
                  widget.notice.content,
                  style:
                      const TextStyle(color: AppTheme.slate300, fontSize: 14),
                ),
                const SizedBox(height: 24),
                const Text(
                  '댓글',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                // ── 댓글 목록 ──
                StreamBuilder<List<NoticeComment>>(
                  stream: _fs.watchTeamNoticeComments(
                      widget.teamId, widget.notice.id),
                  builder: (context, snap) {
                    final comments = snap.data ?? [];
                    if (comments.isEmpty) {
                      return const Padding(
                        padding: EdgeInsets.symmetric(vertical: 16),
                        child: Text('아직 댓글이 없습니다.',
                            style: TextStyle(color: AppTheme.slate500)),
                      );
                    }

                    // 최상위 댓글
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
                          onLike: () => _fs.toggleCommentLike(
                            widget.teamId,
                            widget.notice.id,
                            comment.id,
                            FirebaseAuth.instance.currentUser!.uid,
                          ),
                          onDelete: () => _fs.deleteTeamNoticeComment(
                            widget.teamId,
                            widget.notice.id,
                            comment.id,
                          ),
                        );
                      }).toList(),
                    );
                  },
                ),
              ],
            ),
          ),

          // ── 댓글 입력 ──
          Container(
            padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
            decoration: const BoxDecoration(
              color: AppTheme.slate800,
              border: Border(top: BorderSide(color: AppTheme.slate700)),
            ),
            child: SafeArea(
              top: false,
              child: Column(
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
                                  color: AppTheme.blue400, fontSize: 12)),
                          const Spacer(),
                          GestureDetector(
                            onTap: () => setState(() => _replyToId = null),
                            child: const Text('취소',
                                style: TextStyle(
                                    color: AppTheme.slate400, fontSize: 12)),
                          ),
                        ],
                      ),
                    ),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _commentCtrl,
                          decoration: const InputDecoration(
                            hintText: '댓글을 입력하세요...',
                            border: InputBorder.none,
                            isDense: true,
                            contentPadding: EdgeInsets.symmetric(vertical: 8),
                          ),
                          style: const TextStyle(fontSize: 14),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.send, color: AppTheme.blue400),
                        onPressed: _postComment,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CommentTile extends StatelessWidget {
  const _CommentTile({
    required this.comment,
    required this.replies,
    required this.currentUid,
    this.onReply,
    this.onLike,
    this.onDelete,
  });

  final NoticeComment comment;
  final List<NoticeComment> replies;
  final String currentUid;
  final VoidCallback? onReply;
  final VoidCallback? onLike;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final isLiked = comment.likedBy.contains(currentUid);
    final isMine = comment.uid == currentUid;

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
            ],
          ),
          const SizedBox(height: 4),
          Text(comment.content,
              style: const TextStyle(color: AppTheme.slate300, fontSize: 13)),
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
              if (isMine) ...[
                const SizedBox(width: 16),
                GestureDetector(
                  onTap: onDelete,
                  child: const Text('삭제',
                      style: TextStyle(color: AppTheme.red500, fontSize: 11)),
                ),
              ],
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
                                        color: AppTheme.slate500,
                                        fontSize: 10),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 2),
                              Text(r.content,
                                  style: const TextStyle(
                                      color: AppTheme.slate400,
                                      fontSize: 12)),
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
